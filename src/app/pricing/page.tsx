"use client";

import { useState, useEffect } from "react";
import { Check, X, ArrowRight, Building2, Server, Zap, Users, Boxes, Sparkles } from "lucide-react";
import Footer from "@/components/Footer";
import { useAppContext } from "@/contexts/AppContext";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import UpgradeRequestModal from "@/components/pricing/UpgradeRequestModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";
import { formatYuanFromPoints, POINT_RATE_HINT, POINT_RATE_TEXT } from "@/lib/point-rate";

/** 会员等级：字段与数据库 membershiplevel 表一一对应（价格单位为「分」） */
interface MembershipLevel {
  id: string;
  name: string;
  nameZh: string;
  icon: string | null;
  color: string;
  description: string | null;
  maxPersonalWorkspaces: number;
  maxEnterpriseWorkspaces: number; // -1 表示无限制
  maxComponents: number; // 可装配组件实例配额，-1 表示无限制
  maxTeamSize: number;
  maxStorage: number; // 单位：字节
  maxApiCalls: number;
  tokenLimit: number;
  features: string[];
  priceMonthly: number;
  priceYearly: number;
  trialDays: number;
  sortOrder: number;
  isPopular: boolean;
  isRecommended: boolean;
}

/** 组件目录真实统计，由后端聚合查询，禁止前端硬编码 */
interface ComponentStats {
  totalComponents: number;
  premiumComponents: number;
  freeComponents: number;
}

const UNLIMITED = -1;

/** 配额格式化：无限制显示「无限」，否则千分位 */
const formatQuota = (value: number): string =>
  value === UNLIMITED ? "无限" : value.toLocaleString();

/** 存储格式化：字节转 GB，无限制显示「无限」 */
const formatStorage = (bytes: number): string =>
  bytes === UNLIMITED ? "无限" : `${(bytes / 1024 ** 3).toFixed(0)} GB`;

/** 价格格式化：数据库以「分」存储，展示前统一换算为元 */
const formatPrice = (cents: number): number => cents / 100;

/**
 * 年付折扣百分比：按 (月付×12 - 年付) / (月付×12) 动态计算。
 * 无年付差价时返回 null（前端不展示折扣徽章）。
 */
const calcYearlyDiscount = (monthly: number, yearly: number): number | null => {
  if (monthly <= 0 || yearly <= 0) return null;
  const yearlyByMonth = monthly * 12;
  if (yearlyByMonth <= yearly) return null;
  return Math.round(((yearlyByMonth - yearly) / yearlyByMonth) * 100);
};

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [levels, setLevels] = useState<MembershipLevel[]>([]);
  const [stats, setStats] = useState<ComponentStats>({
    totalComponents: 0,
    premiumComponents: 0,
    freeComponents: 0,
  });
  const [loading, setLoading] = useState(true);
  const { userState } = useAppContext();
  const router = useRouter();
  const toast = useToast();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; displayName: string } | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<{ level: MembershipLevel; cycle: "MONTH" | "YEAR"; amount: number } | null>(null);
  const [upgradingMembership, setUpgradingMembership] = useState(false);
  // 会员升级弹窗中的支付方式选择：当前后端仅支持模拟支付，真实通道后续接入
  const [membershipPaymentMethod, setMembershipPaymentMethod] = useState<"SIMULATED" | "WECHAT_PAY" | "ALIPAY">("SIMULATED");
  // 由升级中枢跳转携带的目标档位（?target=GOLD），用于自动聚焦与高亮
  // 注意：不可命名为 targetLevel，该名已被下方「推荐等级」变量占用
  const [focusLevel, setFocusLevel] = useState<string | null>(null);

  useEffect(() => {
    fetchMembershipLevels();
    // 读取 URL 上的目标档位参数
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setFocusLevel(params.get("target"));
    }
  }, []);

  // 数据就绪后，将用户选定的档位滚动到视野中央
  useEffect(() => {
    if (!focusLevel || loading || levels.length === 0) return;
    const el = document.getElementById(`plan-${focusLevel}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusLevel, loading, levels.length]);

  // 打开会员升级结算弹窗时重置为默认支付方式（模拟支付）
  useEffect(() => {
    if (checkoutPlan) setMembershipPaymentMethod("SIMULATED");
  }, [checkoutPlan]);

  const fetchMembershipLevels = async () => {
    try {
      const response = await fetch("/api/membership/levels");
      const result = await response.json();
      if (result.success && Array.isArray(result.data)) {
        setLevels(result.data);
        if (result.stats) setStats(result.stats);
      }
    } catch (error) {
      console.error("Failed to fetch membership levels:", error);
      toast.error("套餐数据加载失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const currentMembership = userState.userInfo?.membershipLevel;

  /** 在线模拟支付并立即开通会员 */
  const confirmMembershipUpgrade = async () => {
    if (!checkoutPlan) return;
    if (upgradingMembership) return;
    setUpgradingMembership(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/membership/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          targetLevel: checkoutPlan.level.name,
          billingCycle: checkoutPlan.cycle,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "会员升级失败，请稍后重试");
      }
      toast.success(data.message || "会员套餐已开通");
      setCheckoutPlan(null);
      setTimeout(() => {
        window.location.href = "/workspace-hub?upgraded=1";
      }, 600);
    } catch (err: any) {
      toast.error(err.message || "网络异常，会员升级失败");
    } finally {
      setUpgradingMembership(false);
    }
  };

  /** 基准等级（免费版）与升级目标等级（推荐等级，无推荐时取最高档） */
  const baseLevel = levels.find((l) => l.priceMonthly === 0) || levels[0];
  const targetLevel =
    levels.find((l) => l.isPopular) ||
    [...levels].reverse().find((l) => l.priceMonthly > 0) ||
    levels[levels.length - 1];

  /** 对比矩阵：行定义全部取自数据库配额字段，随后台配置实时变化 */
  const featureMatrix = [
    {
      feature: "可装配组件额度",
      icon: <Boxes className="w-3.5 h-3.5" />,
      render: (l: MembershipLevel) => formatQuota(l.maxComponents),
    },
    {
      feature: `组件库访问范围`,
      icon: <Boxes className="w-3.5 h-3.5" />,
      render: (l: MembershipLevel) =>
        l.priceMonthly === 0
          ? `基础 ${stats.freeComponents} 个`
          : `全部 ${stats.totalComponents} 个`,
    },
    {
      feature: "每月调用额度",
      icon: <Zap className="w-3.5 h-3.5" />,
      render: (l: MembershipLevel) =>
        l.maxApiCalls === UNLIMITED ? "无限" : `${formatQuota(l.maxApiCalls)}/月`,
    },
    {
      feature: "每月算力 Token",
      icon: <Zap className="w-3.5 h-3.5" />,
      render: (l: MembershipLevel) =>
        l.tokenLimit === UNLIMITED
          ? "无限"
          : `${formatQuota(l.tokenLimit)}/月（${formatYuanFromPoints(l.tokenLimit)}）`,
    },
    {
      feature: "企业空间数量",
      icon: <Building2 className="w-3.5 h-3.5" />,
      render: (l: MembershipLevel) => formatQuota(l.maxEnterpriseWorkspaces),
    },
    {
      feature: "团队协同人数",
      icon: <Users className="w-3.5 h-3.5" />,
      render: (l: MembershipLevel) => formatQuota(l.maxTeamSize),
    },
    {
      feature: "云端存储空间",
      icon: <Server className="w-3.5 h-3.5" />,
      render: (l: MembershipLevel) => formatStorage(l.maxStorage),
    },
    {
      feature: "免费试用天数",
      icon: <Check className="w-3.5 h-3.5" />,
      render: (l: MembershipLevel) => (l.trialDays > 0 ? `${l.trialDays} 天` : "-"),
    },
  ];

  /** 升级特权卡片：免费版 ➔ 目标等级，数值全部取数据库真实配额 */
  const upgradeHighlights =
    baseLevel && targetLevel
      ? [
          {
            title: "企业空间数量",
            icon: <Building2 className="w-6 h-6" />,
            iconClass: "bg-blue-50 text-[#2b6cb0]",
            boxClass: "bg-[#f0f8ff] border-blue-100/50",
            accent: "text-[#2b6cb0]",
            desc: `可同时创建并管理最多 ${formatQuota(targetLevel.maxEnterpriseWorkspaces)} 个企业工作空间。免费体验版仅限 ${formatQuota(baseLevel.maxEnterpriseWorkspaces)} 个个人开发沙盒空间。`,
            from: `${formatQuota(baseLevel.maxEnterpriseWorkspaces)} 个个人空间`,
            to: `${formatQuota(targetLevel.maxEnterpriseWorkspaces)} 个企业空间`,
          },
          {
            title: "每月调用额度",
            icon: <Zap className="w-6 h-6" />,
            iconClass: "bg-amber-50 text-[#d97706]",
            boxClass: "bg-amber-50/30 border-amber-100/50",
            accent: "text-[#d97706]",
            desc: "提供更多的组件调用额度，避免在开发或调用高性能组件时额度不足。",
            from: `${formatQuota(baseLevel.maxApiCalls)} 额度`,
            to: `${formatQuota(targetLevel.maxApiCalls)} 额度`,
          },
          {
            title: "可装配组件额度",
            icon: <Boxes className="w-6 h-6" />,
            iconClass: "bg-purple-50 text-purple-600",
            boxClass: "bg-purple-50/30 border-purple-100/50",
            accent: "text-purple-600",
            desc: "组件装配额度决定单个空间内可同时挂载运行的组件实例上限。",
            from: `${formatQuota(baseLevel.maxComponents)} 个`,
            to: `${formatQuota(targetLevel.maxComponents)} 个`,
          },
          {
            title: "解锁高级组件",
            icon: <Server className="w-6 h-6" />,
            iconClass: "bg-emerald-50 text-[#059669]",
            boxClass: "bg-emerald-50 border-emerald-100/60",
            accent: "text-[#059669]",
            desc: `免费版本仅可装配 ${stats.freeComponents} 个基础体验组件，升级后解锁全部 ${stats.totalComponents} 个组件（其中含 ${stats.premiumComponents} 个企业级高级组件）。`,
            from: `${stats.freeComponents} 个体验组件`,
            to: `解锁全部 ${stats.totalComponents} 个组件`,
          },
        ]
      : [];

  /**
   * 按钮策略完全由数据决定：
   * - 未登录：免费档引导注册，付费档引导登录
   * - 已登录且为当前档位：高亮已激活
   * - 企业级无限配额档：转为私有化评估线索收集
   */
  const getButtonConfig = (level: MembershipLevel) => {
    const baseBtnStyle = "w-full py-3.5 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 cursor-pointer";
    const isFree = level.priceMonthly === 0;
    const isCurrent = currentMembership === level.name;

    if (!userState.isLoggedIn) {
      return {
        text: isFree ? "免费注册体验" : "立即登录升级",
        onClick: () => router.push("/auth/login?redirect=/pricing"),
        className: isFree
          ? `${baseBtnStyle} bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:shadow-sm`
          : `${baseBtnStyle} bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white hover:shadow-md hover:shadow-blue-500/10 hover:-translate-y-0.5`,
        showCheck: false,
      };
    }

    if (isCurrent) {
      return {
        text: "当前方案 (已激活)",
        onClick: () => { },
        className: `${baseBtnStyle} bg-emerald-50 text-emerald-600 border border-emerald-100 cursor-not-allowed`,
        showCheck: true,
      };
    }

    if (isFree) {
      return {
        text: currentMembership && currentMembership !== "FREE" ? "不可降级到免费版" : "基础免费可用",
        onClick: () => { },
        className: `${baseBtnStyle} bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-200/50`,
        showCheck: false,
      };
    }

    return {
      text: "立即支付升级",
      onClick: () =>
        setCheckoutPlan({
          level,
          cycle: isYearly ? "YEAR" : "MONTH",
          amount: isYearly ? level.priceYearly : level.priceMonthly,
        }),
      className: `${baseBtnStyle} bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white hover:shadow-lg hover:shadow-blue-500/15 hover:-translate-y-0.5`,
      showCheck: false,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f8ff] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#2b6cb0] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 font-bold">加载方案数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-[#f0f8ff]"
      style={{
        backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.12) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* 科技背景装饰环 */}
      <div className="absolute top-0 left-[-10%] w-[35%] h-[35%] bg-[#3182ce]/[0.06] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[40%] h-[40%] bg-purple-500/[0.05] rounded-full blur-[120px] pointer-events-none" />

      {/* Hero Header */}
      <section className="relative pt-20 pb-12 z-10 text-center">
        <div className="max-w-7xl mx-auto px-6">
          <div className="inline-flex flex-col items-center gap-3 mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-blue-200/30">
              <span className="text-xs text-[#2b6cb0] font-black tracking-wide flex items-center gap-1.5">
                💎 阶梯灵活算力与部署方案
              </span>
            </div>
            {userState.isLoggedIn && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-[#3182ce]/10 to-purple-500/10 backdrop-blur-md rounded-full border border-[#63b3ed]/20 shadow-sm animate-fade-in">
                <span className="text-xs text-slate-700 font-bold">
                  您当前的订阅方案为：
                  <span className="text-[#2b6cb0] font-black ml-1">
                    {levels.find((l) => l.name === currentMembership)?.nameZh || "免费版"}
                    {(() => {
                      const idx = levels.findIndex((l) => l.name === currentMembership);
                      return idx >= 0 ? ` (L${idx + 1} 会员)` : "";
                    })()}
                  </span>
                </span>
              </div>
            )}
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tight">
            算力按需配给，{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3182ce] via-[#2b6cb0] to-purple-600">
              陪伴团队全生命周期
            </span>
          </h1>
          <p className="text-base md:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-6">
            从冷启动个人开发沙盒、核心岗专业增效，到完全隔离的大集群物理私有化交付。
          </p>

          {/* 算力点统一定价规则 */}
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-10 bg-amber-50 border border-amber-200 rounded-full shadow-xs">
            <Zap className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
            <span className="text-xs font-black text-amber-800">{POINT_RATE_TEXT}</span>
            <span className="text-[11px] font-bold text-amber-600 hidden sm:inline">｜{POINT_RATE_HINT}</span>
          </div>

          {/* Billing Toggle Switcher */}
          <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-md rounded-full p-1 border border-slate-200/50 shadow-sm max-w-[200px] mx-auto">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-5 py-2 rounded-full text-xs font-black transition-all cursor-pointer ${!isYearly
                ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              月付
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-5 py-2 rounded-full text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${isYearly
                ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
                }`}
            >
              年付
              {(() => {
                // 折扣按数据库真实月付/年付价格动态计算，取所有档位中最优折扣
                const discounts = levels
                  .map((l) => calcYearlyDiscount(l.priceMonthly, l.priceYearly))
                  .filter((d): d is number => d !== null);
                const best = discounts.length > 0 ? Math.max(...discounts) : null;
                return best ? (
                  <span className="bg-emerald-50 text-[#10b981] text-[9px] font-black px-1.5 py-0.5 rounded-full border border-emerald-200/40">
                    -{best}%
                  </span>
                ) : null;
              })()}
            </button>
          </div>
        </div>
      </section>

      {/* Grid benefits layout - 数据取自数据库组件目录与等级配额统计 */}
      <section className="relative py-8 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-white/40 backdrop-blur-md rounded-[24px] p-6 md:p-8 border border-white/80 shadow-md">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: `${stats.totalComponents} 个专业研发组件`,
                  description: `组件库已上架 ${stats.totalComponents} 个覆盖全研发链路的专业组件，其中 ${stats.premiumComponents} 个企业级高级组件供中高阶套餐解锁调用。`,
                },
                {
                  title: "阶梯化算力分配",
                  description: `从免费版每月 ${formatQuota(baseLevel?.tokenLimit ?? 0)} Token 算力，到旗舰版 ${targetLevel?.tokenLimit === UNLIMITED ? "无限" : formatQuota(targetLevel?.tokenLimit ?? 0)} Token，无缝契合业务生命周期各阶段。`,
                },
                {
                  title: "企业级合规底座",
                  description: "所有套餐均提供完备的安全沙箱隔离，保障企业知识资产物理级隔离。",
                },
              ].map((benefit, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-[#3182ce]/15 to-purple-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-[#2b6cb0] font-black text-sm">{index + 1}</span>
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-sm md:text-base mb-1">{benefit.title}</h3>
                    <p className="text-slate-500 text-xs leading-relaxed font-medium">{benefit.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section id="pricing-plans" className="relative py-12 z-10">
        <div className="max-w-7xl mx-auto px-6">
          {levels.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm font-bold">
              暂无可展示的订阅方案，请前往管理员后台配置会员等级。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {levels.map((level, index) => {
                const buttonConfig = getButtonConfig(level);
                // 数据库价格单位为「分」，展示前换算为元
                const price = isYearly ? formatPrice(level.priceYearly) : formatPrice(level.priceMonthly);
                const isCurrentPlan = currentMembership === level.name;
                const discount = calcYearlyDiscount(level.priceMonthly, level.priceYearly);
                // 由升级中枢选定的目标档位：优先高亮，避免与其它徽章重叠
                const isTargetPlan = focusLevel === level.name;

                return (
                  <div
                    key={level.id}
                    id={`plan-${level.name}`}
                    className={`relative bg-white/70 backdrop-blur-xl rounded-[20px] border transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 ${isTargetPlan
                      ? "border-2 border-[#3182ce] shadow-2xl shadow-[#3182ce]/20 ring-4 ring-[#3182ce]/20"
                      : level.isPopular
                        ? "border-2 border-[#3182ce] shadow-xl shadow-[#3182ce]/10"
                        : isCurrentPlan
                          ? "border-2 border-emerald-500 shadow-xl shadow-emerald-500/10"
                          : "border-white/80"
                      }`}
                  >
                    {isTargetPlan && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-md">
                        您选择的目标方案
                      </div>
                    )}

                    {!isTargetPlan && level.isPopular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-black px-4 py-1.5 rounded-full shadow-md">
                        最受企业推荐
                      </div>
                    )}

                    {!isTargetPlan && isCurrentPlan && !level.isPopular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-md">
                        当前订阅方案
                      </div>
                    )}

                    <div className="p-8">
                      {/* Header elements */}
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                            style={{ backgroundColor: `${level.color}1a` }}
                          >
                            {level.icon || "💎"}
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-slate-800">
                              {level.nameZh}
                            </h3>
                            <p className="text-[10px] text-slate-500 mt-0.5 leading-snug font-medium">{level.description}</p>
                          </div>
                        </div>
                        <span
                          className="text-white text-[10px] font-black px-2.5 py-1 rounded-md"
                          style={{ backgroundColor: level.color }}
                        >
                          L{index + 1} 会员
                        </span>
                      </div>

                      {/* Price section */}
                      <div className="mb-6">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-black text-slate-800">
                            {price === 0 ? "免费" : `¥${price.toLocaleString()}`}
                          </span>
                          {price > 0 && (
                            <span className="text-xs text-slate-500 font-bold">
                              /{isYearly ? "年" : "月"}
                            </span>
                          )}
                        </div>
                        {price > 0 && isYearly && discount !== null && (
                          <div className="text-[11px] text-slate-400 font-medium mt-1">
                            按月原价: ¥{formatPrice(level.priceMonthly)}/月 (省 ¥{formatPrice(level.priceMonthly * 12 - level.priceYearly).toLocaleString()}/年)
                          </div>
                        )}
                        {level.trialDays > 0 && (
                          <div className="text-[11px] text-emerald-600 font-bold mt-1">
                            含 {level.trialDays} 天免费试用
                          </div>
                        )}
                      </div>

                      <div className="h-px bg-slate-100 mb-6" />

                      {/* Features list - 直接渲染数据库配置的权益项 */}
                      <ul className="space-y-3.5 mb-8">
                        {level.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <span className="text-xs leading-normal font-bold text-slate-700">
                              {feature}
                            </span>
                          </li>
                        ))}
                        {/* 关键配额可视化：与数据库配额字段实时同步 */}
                        <li className="flex items-start gap-3 pt-1 border-t border-slate-100/70">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-xs leading-normal font-bold text-slate-700">
                            组件装配额度 {formatQuota(level.maxComponents)} · 团队 {formatQuota(level.maxTeamSize)} 人
                          </span>
                        </li>
                      </ul>

                      {/* CTA button */}
                      <button
                        onClick={buttonConfig.onClick}
                        className={buttonConfig.className}
                      >
                        {buttonConfig.showCheck && <Check className="w-4 h-4" />}
                        {buttonConfig.text}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 核心权益图解解读区段 */}
      <section className="relative py-12 z-10 border-t border-slate-200/30 bg-slate-50/20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              升级企业空间额度享有的特权
            </h2>
            <p className="text-slate-500 text-sm mt-2 font-medium">清晰解答为什么需要升级额度以及升级后拥有的具体特权</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {upgradeHighlights.map((card, index) => (
              <div
                key={card.title}
                className="bg-white/60 backdrop-blur-md rounded-[20px] p-6 border border-white/80 shadow-sm hover:shadow-md transition-all duration-300"
              >
                <div className={`w-12 h-12 ${card.iconClass} rounded-xl flex items-center justify-center mb-4`}>
                  {card.icon}
                </div>
                <h3 className="text-base font-black text-slate-800 mb-2">{card.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed font-medium mb-3">{card.desc}</p>
                <div className={`${card.boxClass} rounded-lg p-3 border`}>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">
                    {["空间数量变化", "每月调用额度", "组件装配额度", "组件解锁范围"][index]}
                  </span>
                  <span className="text-xs text-slate-700 font-bold">
                    {card.from} ➔ <span className={`${card.accent} font-black`}>{card.to}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Matrix comparison table */}
      <section className="relative py-16 z-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              等级权益对比矩阵
            </h2>
            <p className="text-slate-500 text-sm mt-2 font-medium">清晰对比不同版本核心研发与运维保障能力</p>
          </div>

          <div className="bg-white/50 backdrop-blur-md rounded-[20px] border border-white/80 overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-white/80 border-b border-slate-200">
                    <th className="px-6 py-4 text-left font-black text-slate-700 text-sm">
                      功能权益对照
                    </th>
                    {levels.map((level, index) => (
                      <th
                        key={level.id}
                        className={`px-6 py-4 text-center font-black text-sm ${level.isPopular ? "text-[#2b6cb0] bg-blue-50/25" : "text-slate-500"
                          }`}
                        style={level.isPopular ? undefined : { color: level.color }}
                      >
                        {level.nameZh} (L{index + 1})
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {featureMatrix.map((row, rowIndex) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-slate-100/50 ${rowIndex % 2 === 0 ? "bg-white/30" : "bg-slate-50/30"} hover:bg-[#3182ce]/5 transition-colors`}
                    >
                      <td className="px-6 py-4 text-slate-700 text-xs md:text-sm font-bold">
                        <span className="inline-flex items-center gap-2">
                          <span className="text-slate-400">{row.icon}</span>
                          {row.feature}
                        </span>
                      </td>
                      {levels.map((level) => {
                        const value = row.render(level);
                        return (
                          <td
                            key={level.id}
                            className={`px-6 py-4 text-center text-xs md:text-sm font-bold ${level.isPopular ? "text-[#2b6cb0] font-black bg-blue-50/15" : "text-slate-600"
                              }`}
                          >
                            {value === "✓" ? (
                              <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                            ) : value === "-" ? (
                              <X className="w-4 h-4 text-slate-300 mx-auto" />
                            ) : (
                              value
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing bottom upgrade banner */}
      <section className="relative py-20 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-900 overflow-hidden">
        {/* Dotted dark grid */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-tight">
            立即释放百倍研发效能
          </h2>
          <p className="text-sm md:text-base text-slate-400 mb-10 max-w-2xl mx-auto">
            一键绑定组织空间，立即解锁全部 {stats.totalComponents} 项研发辅助组件（含 {stats.premiumComponents} 项企业级高级组件）与专用高性能离线运行时算力。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => {
                if (userState.isLoggedIn) {
                  document.getElementById("pricing-plans")?.scrollIntoView({ behavior: "smooth" });
                } else {
                  router.push("/auth/login?redirect=/pricing");
                }
              }}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-base font-black rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span>{userState.isLoggedIn ? "立即查看订阅套餐" : "免费获取尝鲜订阅"}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <p className="text-slate-400 text-xs font-medium">
              需要定制方案？
              <Link
                href="/solutions?consult=true"
                className="text-white font-black hover:underline ml-1"
              >
                联系咨询架构师
              </Link>
            </p>
          </div>
        </div>
      </section>

      <Footer />

      <UpgradeRequestModal
        open={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        planName={selectedPlan?.name || ""}
        planDisplayName={selectedPlan?.displayName || ""}
        isLoggedIn={userState.isLoggedIn}
        userInfo={userState.userInfo}
      />

      <ConfirmDialog
        isOpen={!!checkoutPlan}
        title={checkoutPlan ? `确认开通${checkoutPlan.level.nameZh}会员` : "确认开通会员"}
        message={
          checkoutPlan
            ? `本次为在线模拟支付，金额 ¥${(checkoutPlan.amount / 100).toFixed(2)}/${checkoutPlan.cycle === "YEAR" ? "年" : "月"}。确认后将立即开通并刷新企业空间数量与配额。`
            : ""
        }
        warnings={["模拟支付成功后，企业空间创建配额将按新会员等级立即生效"]}
        type="info"
        confirmText={upgradingMembership ? "开通中..." : "确认支付并开通"}
        cancelText="取消"
        onConfirm={confirmMembershipUpgrade}
        onCancel={() => setCheckoutPlan(null)}
      >
        <div className="mb-4 space-y-2.5">
          <label className="block text-xs font-black text-slate-700">选择支付方式：</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 模拟支付：当前会员升级唯一可用通道 */}
            <button
              type="button"
              onClick={() => setMembershipPaymentMethod("SIMULATED")}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                membershipPaymentMethod === "SIMULATED"
                  ? "border-[#3182ce] bg-blue-50/80 ring-2 ring-[#3182ce]/20 text-[#2b6cb0]"
                  : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
              }`}
            >
              <Sparkles className="w-5 h-5 shrink-0" />
              <span>模拟支付</span>
            </button>

            {/* 微信支付：真实通道，后续接入 */}
            <button
              type="button"
              disabled
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-xs font-bold transition-all cursor-not-allowed opacity-60"
            >
              <img src="/icons/wechat-pay.png" alt="" className="w-5 h-5 object-contain shrink-0 grayscale" />
              <span>微信支付</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded font-bold">即将支持</span>
            </button>

            {/* 支付宝：真实通道，后续接入 */}
            <button
              type="button"
              disabled
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-xs font-bold transition-all cursor-not-allowed opacity-60"
            >
              <img src="/icons/alipay.png" alt="" className="w-5 h-5 object-contain shrink-0 grayscale" />
              <span>支付宝</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded font-bold">即将支持</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 font-medium">
            当前会员升级仅开放模拟支付，真实支付通道后续接入。
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
