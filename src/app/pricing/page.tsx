"use client";

import { useState, useEffect } from "react";
import { Check, X, User, Building2, Server, ArrowRight } from "lucide-react";
import Footer from "@/components/Footer";
import { useAppContext } from "@/contexts/AppContext";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import UpgradeRequestModal from "@/components/pricing/UpgradeRequestModal";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PricingPlan {
  id: string;
  name: string;
  displayName: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: PlanFeature[];
  popular?: boolean;
  levelBadge: string;
  levelColor: string;
  icon: React.ReactNode;
}

const DEFAULT_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "FREE",
    displayName: "社区尝鲜版",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "个人沙盒、基础组件、有限算力",
    levelBadge: "L1",
    levelColor: "bg-gray-500",
    icon: <User className="w-5 h-5 text-slate-500" />,
    features: [
      { text: "1 个个人空间", included: true },
      { text: "基础组件访问", included: true },
      { text: "每月 1000 调用额度", included: true },
      { text: "社区技术支持", included: true },
      { text: "企业空间创建", included: false },
      { text: "团队协作功能", included: false },
      { text: "高级组件解锁", included: false },
      { text: "私有化部署", included: false },
    ],
  },
  {
    id: "silver",
    name: "SILVER",
    displayName: "岗位专业版",
    monthlyPrice: 299,
    yearlyPrice: 239,
    description: "3个企业空间、解锁高阶组件、团队协同",
    popular: true,
    levelBadge: "L2",
    levelColor: "bg-[#2b6cb0]",
    icon: <Building2 className="w-5 h-5 text-[#2b6cb0]" />,
    features: [
      { text: "3 个企业空间", included: true },
      { text: "全部 53 个组件", included: true },
      { text: "每月 100000 调用额度", included: true },
      { text: "优先技术支持", included: true },
      { text: "团队协作功能", included: true },
      { text: "岗位权限配置", included: true },
      { text: "私有化部署", included: false },
      { text: "专属定制服务", included: false },
    ],
  },
  {
    id: "crown",
    name: "CROWN",
    displayName: "私有化尊享版",
    monthlyPrice: 12500,
    yearlyPrice: 12500,
    description: "物理隔离部署、源码级二开支持、专属服务",
    levelBadge: "L3",
    levelColor: "bg-purple-600",
    icon: <Server className="w-5 h-5 text-purple-600" />,
    features: [
      { text: "无限企业空间", included: true },
      { text: "全部 53 个组件", included: true },
      { text: "无限调用额度", included: true },
      { text: "7x24 专属支持", included: true },
      { text: "私有化部署", included: true },
      { text: "源码级二开支持", included: true },
      { text: "专属定制服务", included: true },
      { text: "定制化开发", included: true },
    ],
  },
];

const featureMatrix = [
  {
    feature: "组件使用权",
    FREE: "基础 (6个)",
    SILVER: "全部 (53个)",
    CROWN: "全部 (53个)",
  },
  {
    feature: "调用额度",
    FREE: "1,000/月",
    SILVER: "100,000/月",
    CROWN: "无限",
  },
  { feature: "部署方式", FREE: "SaaS", SILVER: "SaaS", CROWN: "私有化部署" },
  { feature: "团队协作", FREE: "-", SILVER: "✓", CROWN: "✓" },
  { feature: "权限管理", FREE: "-", SILVER: "✓", CROWN: "✓" },
  { feature: "专属支持", FREE: "社区支持", SILVER: "优先保障", CROWN: "7x24 驻场" },
];

const levelBenefits = [
  {
    title: "阶梯化算力分配",
    description: "从轻量级尝鲜沙盒到无限私有算力，无缝契合业务生命周期各个阶段。",
  },
  {
    title: "企业级合规底座",
    description: "所有套餐均提供完备的安全沙箱隔离，保障企业知识资产物理级隔离。",
  },
  {
    title: "专家级顾问架构",
    description: "中高级套餐附带专业顾问一对一方案研讨，协助设计最稳妥的拓扑实施方案。",
  },
];

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const { userState } = useAppContext();
  const router = useRouter();
  const toast = useToast();
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; displayName: string } | null>(null);

  useEffect(() => {
    fetchMembershipLevels();
  }, []);

  const parseFeatures = (dbFeatures: any, defaultPreset: PlanFeature[]): PlanFeature[] => {
    if (!dbFeatures) return defaultPreset;
    try {
      if (Array.isArray(dbFeatures)) {
        return dbFeatures.map((feat: any) => {
          const text = String(feat);
          if (text.startsWith("-")) {
            return { text: text.substring(1), included: false };
          } else if (text.startsWith("+")) {
            return { text: text.substring(1), included: true };
          }
          return { text, included: true };
        });
      }
    } catch (e) {
      console.error("Error parsing features from DB:", e);
    }
    return defaultPreset;
  };

  const fetchMembershipLevels = async () => {
    try {
      const response = await fetch("/api/membership/levels");
      const result = await response.json();
      if (result.success && result.data && result.data.length > 0) {
        const DISPLAY_PLANS = ["FREE", "SILVER", "CROWN"];
        const levelConfig: Record<string, { badge: string; color: string; icon: React.ReactNode }> = {
          FREE: { badge: "L1", color: "bg-gray-500", icon: <User className="w-5 h-5 text-slate-500" /> },
          SILVER: { badge: "L2", color: "bg-[#2b6cb0]", icon: <Building2 className="w-5 h-5 text-[#2b6cb0]" /> },
          CROWN: { badge: "L3", color: "bg-purple-600", icon: <Server className="w-5 h-5 text-purple-600" /> },
        };
        const filteredPlans = result.data
          .filter((level: any) => DISPLAY_PLANS.includes(level.name))
          .map((level: any) => ({
            id: level.id,
            name: level.name,
            displayName: level.displayName,
            monthlyPrice: level.priceMonthly,
            yearlyPrice: level.priceYearly,
            description: level.description,
            features: parseFeatures(level.features, DEFAULT_PLANS.find((p) => p.name === level.name)?.features || DEFAULT_PLANS[0].features),
            popular: level.name === "SILVER",
            levelBadge: levelConfig[level.name]?.badge || "L1",
            levelColor: levelConfig[level.name]?.color || "bg-gray-500",
            icon: levelConfig[level.name]?.icon || DEFAULT_PLANS[0].icon,
          }));
        setPlans(filteredPlans.length > 0 ? filteredPlans : DEFAULT_PLANS);
      } else {
        setPlans(DEFAULT_PLANS);
      }
    } catch (error) {
      console.error("Failed to fetch membership levels:", error);
      setPlans(DEFAULT_PLANS);
    } finally {
      setLoading(false);
    }
  };

  const currentMembership = userState.userInfo?.membershipLevel;
  const isVip = currentMembership && currentMembership !== "FREE";

  const getButtonConfig = (planName: string) => {
    const baseBtnStyle = "w-full py-3.5 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 cursor-pointer";
    if (planName === "FREE") {
      if (!userState.isLoggedIn) {
        return {
          text: "免费注册体验",
          onClick: () => router.push("/auth/login?redirect=/pricing"),
          className: `${baseBtnStyle} bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:shadow-sm`,
          showCheck: false,
        };
      } else if (!isVip) {
        return {
          text: "当前方案 (已激活)",
          onClick: () => {},
          className: `${baseBtnStyle} bg-slate-100 text-slate-400 cursor-not-allowed border border-transparent`,
          showCheck: false,
        };
      } else {
        return {
          text: "基础免费可用",
          onClick: () => {},
          className: `${baseBtnStyle} bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-200/50`,
          showCheck: false,
        };
      }
    } else if (planName === "SILVER") {
      if (!userState.isLoggedIn) {
        return {
          text: "立即登录升级",
          onClick: () => router.push("/auth/login?redirect=/pricing"),
          className: `${baseBtnStyle} bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white hover:shadow-md hover:shadow-blue-500/10 hover:-translate-y-0.5`,
          showCheck: false,
        };
      } else if (!isVip) {
        return {
          text: "立即支付升级",
          onClick: () => {
            setSelectedPlan({ name: "SILVER", displayName: "岗位专业版" });
            setShowRequestModal(true);
          },
          className: `${baseBtnStyle} bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white hover:shadow-lg hover:shadow-blue-500/15 hover:-translate-y-0.5`,
          showCheck: false,
        };
      } else {
        return {
          text: "当前方案 (已激活)",
          onClick: () => {},
          className: `${baseBtnStyle} bg-emerald-50 text-emerald-600 border border-emerald-100 cursor-not-allowed`,
          showCheck: true,
        };
      }
    } else {
      if (userState.isLoggedIn) {
        return {
          text: "提交大客户私有化评估",
          onClick: () => {
            setSelectedPlan({ name: "CROWN", displayName: "私有化尊享版" });
            setShowRequestModal(true);
          },
          className: `${baseBtnStyle} bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md hover:-translate-y-0.5`,
          showCheck: false,
        };
      } else {
        return {
          text: "联系专属架构专家",
          onClick: () => {
            setSelectedPlan({ name: "CROWN", displayName: "私有化尊享版" });
            setShowRequestModal(true);
          },
          className: `${baseBtnStyle} bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md hover:-translate-y-0.5`,
          showCheck: false,
        };
      }
    }
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
                    {userState.userInfo?.membershipLevel === "SILVER" ? "岗位专业版 (L2 会员)" : "普通用户 (L1)"}
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
          <p className="text-base md:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-10">
            从冷启动个人开发沙盒、核心岗专业增效，到完全隔离的大集群物理私有化交付。
          </p>

          {/* Billing Toggle Switcher */}
          <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-md rounded-full p-1 border border-slate-200/50 shadow-sm max-w-[200px] mx-auto">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-5 py-2 rounded-full text-xs font-black transition-all cursor-pointer ${
                !isYearly
                  ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              月付
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-5 py-2 rounded-full text-xs font-black transition-all flex items-center gap-1 cursor-pointer ${
                isYearly
                  ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              年付
              <span className="bg-emerald-50 text-[#10b981] text-[9px] font-black px-1.5 py-0.5 rounded-full border border-emerald-200/40">
                -20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Grid benefits layout */}
      <section className="relative py-8 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-white/40 backdrop-blur-md rounded-[24px] p-6 md:p-8 border border-white/80 shadow-md">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {levelBenefits.map((benefit, index) => (
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan) => {
              const buttonConfig = getButtonConfig(plan.name);
              const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
              const isCurrentPlan = currentMembership === plan.name;
              
              return (
                <div
                  key={plan.id}
                  className={`relative bg-white/70 backdrop-blur-xl rounded-[20px] border transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 ${
                    plan.popular
                      ? "border-2 border-[#3182ce] shadow-xl shadow-[#3182ce]/10"
                      : isCurrentPlan
                      ? "border-2 border-emerald-500 shadow-xl shadow-emerald-500/10"
                      : "border-white/80"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-black px-4 py-1.5 rounded-full shadow-md">
                      最受企业推荐
                    </div>
                  )}

                  {isCurrentPlan && !plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-black px-4 py-1.5 rounded-full shadow-md">
                      当前订阅方案
                    </div>
                  )}

                  <div className="p-8">
                    {/* Header elements */}
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 ${
                          plan.name === "FREE" ? "bg-slate-100" : plan.name === "SILVER" ? "bg-blue-50" : "bg-purple-50"
                        } rounded-xl flex items-center justify-center flex-shrink-0`}>
                          {plan.icon}
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-slate-800">
                            {plan.displayName}
                          </h3>
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug font-medium">{plan.description}</p>
                        </div>
                      </div>
                      <span className={`${plan.levelColor} text-white text-[10px] font-black px-2.5 py-1 rounded-md`}>
                        {plan.levelBadge} 会员
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
                      {price > 0 && isYearly && plan.monthlyPrice !== plan.yearlyPrice && (
                        <div className="text-[11px] text-slate-400 font-medium mt-1">
                          按月原价: ¥{plan.monthlyPrice}/月 (省 ¥{(plan.monthlyPrice * 12 - plan.yearlyPrice).toLocaleString()}/年)
                        </div>
                      )}
                    </div>

                    <div className="h-px bg-slate-100 mb-6" />

                    {/* Features list */}
                    <ul className="space-y-3.5 mb-8">
                      {plan.features.map((feature) => (
                        <li key={feature.text} className="flex items-start gap-3">
                          {feature.included ? (
                            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <X className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`text-xs leading-normal font-bold ${
                              feature.included ? "text-slate-700" : "text-slate-400"
                            }`}
                          >
                            {feature.text}
                          </span>
                        </li>
                      ))}
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
            {/* 卡片 1 */}
            <div className="bg-white/60 backdrop-blur-md rounded-[20px] p-6 border border-white/80 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4 text-[#2b6cb0]">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-2">企业空间数量</h3>
              <p className="text-slate-500 text-xs leading-relaxed font-medium mb-3">
                可同时创建并管理最多 3 个企业工作空间。免费体验版仅限 1 个个人开发沙盒空间。
              </p>
              <div className="bg-[#f0f8ff] rounded-lg p-3 border border-blue-100/50">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">空间数量变化</span>
                <span className="text-xs text-slate-700 font-bold">1 个个人空间 ➔ <span className="text-[#2b6cb0] font-black">3 个企业空间</span></span>
              </div>
            </div>

            {/* 卡片 2 */}
            <div className="bg-white/60 backdrop-blur-md rounded-[20px] p-6 border border-white/80 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mb-4 text-[#d97706]">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-800 mb-2">每月调用额度</h3>
              <p className="text-slate-500 text-xs leading-relaxed font-medium mb-3">
                提供更多的组件调用额度，避免在开发或调用高性能组件时额度不足。
              </p>
              <div className="bg-amber-50/30 rounded-lg p-3 border border-amber-100/50">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">每月调用额度</span>
                <span className="text-xs text-slate-700 font-bold">1,000 额度 ➔ <span className="text-[#d97706] font-black">100,000 额度</span></span>
              </div>
            </div>

            {/* 卡片 3 */}
            <div className="bg-white/60 backdrop-blur-md rounded-[20px] p-6 border border-white/80 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 text-purple-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-base font-black text-slate-800 mb-2">团队协作与岗位</h3>
              <p className="text-slate-500 text-xs leading-relaxed font-medium mb-3">
                支持邀请团队成员共同研发，并可为岗位分配不同的管理权限与逻辑角色。
              </p>
              <div className="bg-purple-50/30 rounded-lg p-3 border border-purple-100/50">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">团队协同机制</span>
                <span className="text-xs text-slate-700 font-bold">单人孤立沙盒 ➔ <span className="text-purple-600 font-black">支持多人协作与分权</span></span>
              </div>
            </div>

            {/* 卡片 4 */}
            <div className="bg-white/60 backdrop-blur-md rounded-[20px] p-6 border border-white/80 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4 text-[#059669]">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-base font-black text-slate-800 mb-2">解锁高级组件</h3>
              <p className="text-slate-500 text-xs leading-relaxed font-medium mb-3">
                全量解锁全部 53 个高级组件。免费版本限制仅能使用 6 个基础体验组件。
              </p>
              <div className="bg-emerald-50/30 rounded-lg p-3 border border-emerald-100/50">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">高级组件支持</span>
                <span className="text-xs text-slate-700 font-bold">6 个体验组件 ➔ <span className="text-[#059669] font-black">解锁全部 53 个高级组件</span></span>
              </div>
            </div>
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
                    <th className="px-6 py-4 text-center font-black text-slate-500 text-sm w-[22%]">
                      社区尝鲜版 (L1)
                    </th>
                    <th className="px-6 py-4 text-center font-black text-[#2b6cb0] text-sm bg-blue-50/25 w-[22%]">
                      岗位专业版 (L2)
                    </th>
                    <th className="px-6 py-4 text-center font-black text-purple-600 text-sm w-[22%]">
                      私有化尊享版 (L3)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {featureMatrix.map((row, rowIndex) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-slate-100/50 ${rowIndex % 2 === 0 ? "bg-white/30" : "bg-slate-50/30"} hover:bg-[#3182ce]/5 transition-colors`}
                    >
                      <td className="px-6 py-4 text-slate-700 text-xs md:text-sm font-bold">
                        {row.feature}
                      </td>
                      <td className="px-6 py-4 text-center text-slate-600 text-xs md:text-sm font-bold">
                        {row.FREE === "✓" ? (
                          <Check className="w-4.5 h-4.5 text-emerald-500 mx-auto" />
                        ) : row.FREE === "-" ? (
                          <X className="w-4.5 h-4.5 text-slate-300 mx-auto" />
                        ) : (
                          row.FREE
                        )}
                      </td>
                      <td className="px-6 py-4 text-center text-[#2b6cb0] text-xs md:text-sm font-black bg-blue-50/15">
                        {row.SILVER === "✓" ? (
                          <Check className="w-4.5 h-4.5 text-[#2b6cb0] mx-auto" />
                        ) : row.SILVER === "-" ? (
                          <X className="w-4.5 h-4.5 text-slate-300 mx-auto" />
                        ) : (
                          row.SILVER
                        )}
                      </td>
                      <td className="px-6 py-4 text-center text-purple-600 text-xs md:text-sm font-black">
                        {row.CROWN === "✓" ? (
                          <Check className="w-4.5 h-4.5 text-purple-500 mx-auto" />
                        ) : row.CROWN === "-" ? (
                          <X className="w-4.5 h-4.5 text-slate-300 mx-auto" />
                        ) : (
                          row.CROWN
                        )}
                      </td>
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
            一键绑定组织空间，立即解锁 53 项高阶研发辅助组件与专用高性能离线运行时算力。
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
    </div>
  );
}