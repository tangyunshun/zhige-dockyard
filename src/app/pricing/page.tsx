"use client";

import { useState, useEffect } from "react";
import { Check, X, Sparkles, Building2, Server, ArrowRight } from "lucide-react";
import Footer from "@/components/Footer";
import { useAppContext } from "@/contexts/AppContext";
import { useRouter } from "next/navigation";

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
    icon: <Sparkles className="w-5 h-5 text-yellow-600" />,
    features: [
      { text: "1 个个人空间", included: true },
      { text: "基础组件访问", included: true },
      { text: "每月 1000 Token 配额", included: true },
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
    levelColor: "bg-blue-500",
    icon: <Building2 className="w-5 h-5 text-[#2b6cb0]" />,
    features: [
      { text: "3 个企业空间", included: true },
      { text: "全部 53 个组件", included: true },
      { text: "每月 100000 Token 配额", included: true },
      { text: "优先技术支持", included: true },
      { text: "团队协作功能", included: true },
      { text: "岗位权限配置", included: true },
      { text: "私有化部署", included: false },
      { text: "专属模型微调", included: false },
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
      { text: "无限 Token 配额", included: true },
      { text: "7x24 专属支持", included: true },
      { text: "私有化部署", included: true },
      { text: "源码级二开支持", included: true },
      { text: "专属模型微调", included: true },
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
    feature: "Token 配额",
    FREE: "1,000/月",
    SILVER: "100,000/月",
    CROWN: "无限",
  },
  { feature: "部署方式", FREE: "SaaS", SILVER: "SaaS", CROWN: "私有化" },
  { feature: "团队协作", FREE: "-", SILVER: "✓", CROWN: "✓" },
  { feature: "权限管理", FREE: "-", SILVER: "✓", CROWN: "✓" },
  { feature: "专属支持", FREE: "社区", SILVER: "优先", CROWN: "7x24" },
];

const levelBenefits = [
  {
    title: "等级越高，权益越多",
    description: "从基础社区版到尊享私有化版，每个等级都解锁更多强大功能",
  },
  {
    title: "安全与合规",
    description: "所有等级均享有企业级安全保障，高级别更有专属安全服务",
  },
  {
    title: "专属服务",
    description: "VIP 会员享受专属客户经理和优先技术支持通道",
  },
];

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const { userState } = useAppContext();
  const router = useRouter();

  useEffect(() => {
    fetchMembershipLevels();
  }, []);

  const fetchMembershipLevels = async () => {
    try {
      const response = await fetch("/api/membership/levels");
      const result = await response.json();
      if (result.success && result.data && result.data.length > 0) {
        const DISPLAY_PLANS = ["FREE", "SILVER", "CROWN"];
        const levelConfig: Record<string, { badge: string; color: string; icon: React.ReactNode }> = {
          FREE: { badge: "L1", color: "bg-gray-500", icon: <Sparkles className="w-5 h-5 text-yellow-600" /> },
          SILVER: { badge: "L2", color: "bg-blue-500", icon: <Building2 className="w-5 h-5 text-[#2b6cb0]" /> },
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
            features: DEFAULT_PLANS.find((p) => p.name === level.name)?.features || DEFAULT_PLANS[0].features,
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

  const currentMembership = userState.user?.membershipLevel;
  const isVip = currentMembership && currentMembership !== "FREE";

  const getButtonConfig = (planName: string) => {
    if (planName === "FREE") {
      if (!userState.isLoggedIn) {
        return {
          text: "免费注册",
          onClick: () => router.push("/auth/login"),
          className: "w-full py-3 rounded-[4px] font-bold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer",
          showCheck: false,
        };
      } else if (!isVip) {
        return {
          text: "当前所在计划",
          onClick: () => {},
          className: "w-full py-3 rounded-[4px] font-bold bg-slate-100 text-slate-400 cursor-not-allowed",
          showCheck: false,
        };
      } else {
        return {
          text: "基础能力",
          onClick: () => {},
          className: "w-full py-3 rounded-[4px] font-bold border border-slate-200 text-slate-400 cursor-not-allowed",
          showCheck: false,
        };
      }
    } else if (planName === "SILVER") {
      if (!userState.isLoggedIn) {
        return {
          text: "立即升级",
          onClick: () => router.push("/auth/login"),
          className: "w-full py-3 rounded-[4px] font-bold bg-[#2b6cb0] text-white hover:bg-[#2c5282] transition-colors cursor-pointer",
          showCheck: false,
        };
      } else if (!isVip) {
        return {
          text: "立即支付升级",
          onClick: () => {},
          className: "w-full py-3 rounded-[4px] font-bold bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer",
          showCheck: false,
        };
      } else {
        return {
          text: "您当前的计划",
          onClick: () => {},
          className: "w-full py-3 rounded-[4px] font-bold bg-[#38a169]/10 text-[#38a169] cursor-not-allowed flex items-center justify-center gap-2",
          showCheck: true,
        };
      }
    } else {
      return {
        text: "联系专属架构师",
        onClick: () => {},
        className: "w-full py-3 rounded-[4px] font-bold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer",
        showCheck: false,
      };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f0f8ff] to-white pt-17 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#2b6cb0] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f8ff] to-white">
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-6">
            灵活的阶梯算力，陪伴团队从冷启动到行业寡头
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10">
            选择适合您团队规模的方案，按需付费，无隐藏费用
          </p>

          <div className="inline-flex items-center gap-4 bg-slate-100 rounded-full px-2 py-1">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                !isYearly
                  ? "bg-white text-[#2b6cb0] shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              月付
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                isYearly
                  ? "bg-white text-[#2b6cb0] shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              年付
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                省 20%
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {levelBenefits.map((benefit, index) => (
              <div key={index} className="flex items-center gap-4 text-white">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <span className="text-2xl font-bold">{index + 1}</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">{benefit.title}</h3>
                  <p className="text-white/80 text-sm">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-800 mb-4">
              会员等级方案
            </h2>
            <p className="text-slate-600">选择适合您的会员等级，开启效能之旅</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, index) => {
              const buttonConfig = getButtonConfig(plan.name);
              const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
              const isCurrentPlan = currentMembership === plan.name;
              
              return (
                <div
                  key={plan.id}
                  className={`relative bg-white rounded-[12px] border transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 ${
                    plan.popular
                      ? "border-2 border-[#2b6cb0] shadow-xl shadow-[#2b6cb0]/20"
                      : isCurrentPlan
                      ? "border-2 border-green-500 shadow-lg shadow-green-500/10"
                      : "border-slate-100"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#2b6cb0] text-white text-sm font-bold px-4 py-1 rounded-full shadow-lg">
                      最受企业欢迎
                    </div>
                  )}

                  {isCurrentPlan && !plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-green-500 text-white text-sm font-bold px-4 py-1 rounded-full shadow-lg">
                      当前方案
                    </div>
                  )}

                  <div className="p-8">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 ${plan.name === "FREE" ? "bg-yellow-100" : plan.name === "SILVER" ? "bg-blue-100" : "bg-purple-100"} rounded-xl flex items-center justify-center`}>
                          {plan.icon}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-800">
                            {plan.displayName}
                          </h3>
                          <p className="text-xs text-slate-500">{plan.description}</p>
                        </div>
                      </div>
                      <div className={`${plan.levelColor} text-white text-xs font-bold px-3 py-1.5 rounded-full`}>
                        {plan.levelBadge} 等级
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-slate-800">
                          {price === 0 ? "免费" : `¥${price}`}
                        </span>
                        {price > 0 && (
                          <span className="text-slate-500">
                            /{isYearly ? "年" : "月"}
                            {isYearly && plan.monthlyPrice !== plan.yearlyPrice && (
                              <span className="ml-2 text-slate-400 line-through text-sm">
                                ¥{plan.monthlyPrice}/月
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature) => (
                        <li key={feature.text} className="flex items-center gap-3">
                          {feature.included ? (
                            <Check className="w-5 h-5 text-green-600 shrink-0" />
                          ) : (
                            <X className="w-5 h-5 text-slate-300 shrink-0" />
                          )}
                          <span
                            className={
                              feature.included ? "text-slate-700 text-sm" : "text-slate-400 text-sm"
                            }
                          >
                            {feature.text}
                          </span>
                        </li>
                      ))}
                    </ul>

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

      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-slate-800 mb-4">
              等级权益对比
            </h2>
            <p className="text-slate-600">不同会员等级的核心能力差异</p>
          </div>

          <div className="bg-slate-50 rounded-[12px] overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-white border-b-2 border-slate-200">
                  <th className="px-6 py-4 text-left font-bold text-slate-700 bg-white">
                    功能权益
                  </th>
                  <th className="px-6 py-4 text-center font-bold text-slate-700 bg-white">
                    <div className="flex flex-col items-center">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full mb-1">L1</span>
                      社区尝鲜版
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center font-bold text-white bg-[#2b6cb0]">
                    <div className="flex flex-col items-center">
                      <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full mb-1">L2</span>
                      岗位专业版
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center font-bold text-purple-600 bg-white">
                    <div className="flex flex-col items-center">
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full mb-1">L3</span>
                      私有化尊享版
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {featureMatrix.map((row, rowIndex) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-slate-100 ${rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-blue-50/30 transition-colors`}
                  >
                    <td className="px-6 py-4 text-slate-700 font-medium">
                      {row.feature}
                    </td>
                    <td className="px-6 py-4 text-center text-slate-600">
                      {row.FREE === "✓" ? (
                        <Check className="w-5 h-5 text-green-600 mx-auto" />
                      ) : row.FREE === "-" ? (
                        <X className="w-5 h-5 text-slate-300 mx-auto" />
                      ) : (
                        row.FREE
                      )}
                    </td>
                    <td className="px-6 py-4 text-center font-medium bg-blue-50/30">
                      {row.SILVER === "✓" ? (
                        <Check className="w-5 h-5 text-[#2b6cb0] mx-auto" />
                      ) : row.SILVER === "-" ? (
                        <X className="w-5 h-5 text-slate-300 mx-auto" />
                      ) : (
                        <span className="text-[#2b6cb0] font-bold">
                          {row.SILVER}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-slate-700">
                      {row.CROWN === "✓" ? (
                        <Check className="w-5 h-5 text-purple-600 mx-auto" />
                      ) : row.CROWN === "-" ? (
                        <X className="w-5 h-5 text-slate-300 mx-auto" />
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
      </section>

      <section className="py-20 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-black text-white mb-6">
            准备好升级您的会员等级？
          </h2>
          <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
            从 L1 到 L3，每一步升级都解锁更多强大功能，助力您的团队更高效地工作
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={() => router.push(userState.isLoggedIn ? "/workspace-hub" : "/auth/login")}
              className="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#2b6cb0] text-lg font-bold rounded-[4px] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
            >
              <span>{userState.isLoggedIn ? "进入工作台查看等级" : "免费注册升级"}</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <p className="text-slate-400 text-sm">
              需要定制化方案？
              <a
                href="/solutions"
                className="text-white font-bold hover:underline ml-1"
              >
                联系我们
              </a>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}