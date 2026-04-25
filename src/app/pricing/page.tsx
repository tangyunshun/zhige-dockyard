"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  Check,
  X,
  Star,
  Users,
  Zap,
  Shield,
  Crown,
  ArrowLeft,
  TrendingUp,
  Database,
  LifeBuoy,
  Palette,
  Lock,
  Box,
  Building2,
  Server,
  Code,
  Clock,
  Headphones,
  FileText,
  GitMerge,
  BarChart3,
  Globe,
  MessageSquare,
  Bug,
  TestTube2,
  LayoutTemplate,
  Layers,
  Plug,
  FolderLock,
  Activity,
  Star,
  Award,
  Target,
  Rocket,
  Heart,
  Smile,
  Phone,
  Signature,
  Network,
  Scale,
  Package,
  Shirt,
  Image,
  Accessibility,
  Cloud,
  Terminal,
  Scissors,
  FileSpreadsheet,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";

interface MembershipPlan {
  name: string;
  nameZh: string;
  description: string;
  icon: string;
  color: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  maxPersonalWorkspaces: number;
  maxEnterpriseWorkspaces: number;
  maxComponents: number;
  maxTeamSize: number;
  maxStorage: number;
  maxApiCalls: number;
  recommended?: boolean;
  popular?: boolean;
}

interface SpaceType {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  features: string[];
  suitableFor: string;
}

export default function PricingPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const [currentMembership, setCurrentMembership] = useState<string>("FREE");
  const [currentSpaceType, setCurrentSpaceType] = useState<string>("STANDARD");
  const [activeTab, setActiveTab] = useState<"space" | "membership">("space");
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    loadUserInfo();
    loadMembershipPlans();
  }, []);

  const loadUserInfo = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        // 这里应该从用户信息中获取实际的会员等级和空间类型
        // 暂时使用默认值
      }
    } catch (error) {
      console.error("Load user info error:", error);
    }
  };

  const loadMembershipPlans = async () => {
    try {
      setLoadingPlans(true);
      const res = await fetch("/api/membership/levels");
      if (res.ok) {
        const data = await res.json();
        setMembershipPlans(
          data.data.map((plan: any) => ({
            ...plan,
            icon: plan.icon || "�",
            gradient: `linear-gradient(to bottom right, ${plan.color}20, ${plan.color}40)`,
            recommended: plan.name === "SILVER",
            popular: plan.name === "GOLD",
          })),
        );
      } else {
        toast.error("加载会员等级失败");
      }
    } catch (error) {
      console.error("Load membership plans error:", error);
      toast.error("加载会员等级失败");
    } finally {
      setLoadingPlans(false);
    }
  };

  // 辅助函数：获取会员配置（用于对比表）
  const getMembershipConfig = (level: string) => {
    const plan = membershipPlans.find((p) => p.name === level);
    if (!plan) {
      return {
        maxTeamSize: 5,
        maxEnterpriseWorkspaces: 1,
        maxComponents: 100,
        maxStorage: 1024,
      };
    }
    return {
      maxTeamSize: plan.maxTeamSize,
      maxEnterpriseWorkspaces: plan.maxEnterpriseWorkspaces,
      maxComponents: plan.maxComponents,
      maxStorage: plan.maxStorage,
    };
  };

  const spaceTypes: SpaceType[] = [
    {
      id: "STANDARD",
      name: "标准空间",
      description: "基础协作空间，适合小型团队",
      icon: Box,
      color: "#64748b",
      features: [
        "最多 3 个组件",
        "最多 5 名成员",
        "1GB 存储空间",
        "基础组件库权限",
        "标准技术支持",
      ],
      suitableFor: "个人和小型团队",
    },
    {
      id: "PRO",
      name: "专业空间",
      description: "专业协作空间，适合成长型团队",
      icon: Rocket,
      color: "#3182ce",
      features: [
        "最多 25 个组件",
        "最多 20 名成员",
        "10GB 存储空间",
        "全量组件库权限",
        "优先技术支持",
        "数据分析报表",
        "自定义主题",
      ],
      suitableFor: "成长型团队和创业公司",
    },
    {
      id: "ENTERPRISE",
      name: "企业空间",
      description: "企业级协作空间，适合大型团队",
      icon: Building2,
      color: "#f59e0b",
      features: [
        "无限组件数量",
        "无限团队成员",
        "无限存储空间",
        "全量 + 专属组件库",
        "7×24 专属技术支持",
        "高级数据分析",
        "完全自定义主题",
        "完整 API 权限",
        "高级权限管理",
        "专属客户经理",
      ],
      suitableFor: "大型企业和组织",
    },
  ];

  const handleUpgradeMembership = async (level: string) => {
    if (currentMembership === level) {
      toast.info("当前已是该会员等级");
      return;
    }

    setLoading(true);
    try {
      // TODO: 实现真实的升级逻辑
      toast.success("升级功能开发中，请联系客服办理");
    } catch (error) {
      toast.error("升级失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradeSpace = async (spaceType: string) => {
    if (currentSpaceType === spaceType) {
      toast.info("当前已是该空间类型");
      return;
    }

    setLoading(true);
    try {
      // TODO: 实现真实的空间升级逻辑
      toast.success("空间升级功能开发中");
    } catch (error) {
      toast.error("升级失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-medium">返回</span>
            </button>
            <h1 className="text-xl font-bold text-slate-800">会员与空间定价</h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-[1600px] mx-auto px-6 py-12">
        {/* 页面标题 */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black text-slate-800 mb-4">
            灵活定价，满足不同需求
          </h2>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            会员等级控制团队规模、组件数量和使用配额
            <br />
            空间类型决定协作能力和功能权限
            <br />
            <span className="text-sm text-slate-500">
              所有付费套餐均提供 14 天免费试用期
            </span>
          </p>

          {/* 付费周期切换 */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <span
              className={`text-sm font-medium ${
                billingPeriod === "monthly"
                  ? "text-slate-800"
                  : "text-slate-500"
              }`}
            >
              月付
            </span>
            <button
              onClick={() =>
                setBillingPeriod(
                  billingPeriod === "monthly" ? "yearly" : "monthly",
                )
              }
              className={`relative w-14 h-7 rounded-full transition-colors ${
                billingPeriod === "yearly" ? "bg-[#3182ce]" : "bg-slate-300"
              }`}
            >
              <div
                className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  billingPeriod === "yearly" ? "translate-x-8" : "translate-x-1"
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium ${
                billingPeriod === "yearly" ? "text-slate-800" : "text-slate-500"
              }`}
            >
              年付
              <span className="ml-1 text-[#10b981] text-xs font-bold">
                省 20%
              </span>
            </span>
          </div>

          {/* Tab 切换 */}
          <div className="mt-8">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab("space")}
                className={`flex-1 py-3 text-center font-medium transition-colors relative ${
                  activeTab === "space"
                    ? "text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                空间类型
                {activeTab === "space" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("membership")}
                className={`flex-1 py-3 text-center font-medium transition-colors relative ${
                  activeTab === "membership"
                    ? "text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                会员等级
                {activeTab === "membership" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 空间类型 Tab */}
        {activeTab === "space" && (
          <div className="mb-16 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-black text-slate-800 mb-2">
                空间类型
              </h3>
              <p className="text-slate-600">
                决定团队协作能力、组件库权限和功能特性
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {spaceTypes.map((space) => {
                const Icon = space.icon;
                const isCurrentSpace = currentSpaceType === space.id;

                return (
                  <div
                    key={space.id}
                    className={`relative rounded-2xl p-6 transition-all duration-300 hover:-translate-y-2 ${
                      space.id === "PRO"
                        ? "bg-gradient-to-br from-[#3182ce]/10 to-[#2b6cb0]/10 border-2 border-[#3182ce] shadow-xl shadow-[#3182ce]/20"
                        : "bg-white/80 backdrop-blur-xl border-2 border-slate-200 hover:border-[#3182ce]/40 hover:shadow-xl"
                    }`}
                  >
                    {/* 图标和名称 */}
                    <div className="text-center mb-5">
                      <div
                        className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-lg`}
                        style={{
                          background: `linear-gradient(to bottom right, ${space.color}20, ${space.color}40)`,
                        }}
                      >
                        <Icon
                          className="w-8 h-8"
                          style={{ color: space.color }}
                        />
                      </div>
                      <h3 className="text-xl font-black text-slate-800 mb-1">
                        {space.name}
                      </h3>
                      <p className="text-xs text-slate-600 mb-3">
                        {space.description}
                      </p>
                      <div className="inline-block px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full">
                        适合：{space.suitableFor}
                      </div>
                    </div>

                    {/* 功能列表 */}
                    <div className="space-y-2.5 mb-6">
                      {space.features.map((feature, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Check className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" />
                          <span className="text-slate-700">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* 操作按钮 */}
                    <button
                      onClick={() => handleUpgradeSpace(space.id)}
                      disabled={loading || isCurrentSpace}
                      className={`w-full py-3 rounded-xl font-bold transition-all ${
                        isCurrentSpace
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-gradient-to-r from-slate-800 to-slate-700 text-white hover:shadow-lg hover:-translate-y-0.5"
                      }`}
                    >
                      {isCurrentSpace ? "当前空间" : "升级到此空间"}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 权益对比表链接 */}
            <div className="mt-8 text-center">
              <button
                onClick={() => {
                  const tableSection =
                    document.getElementById("comparison-table");
                  tableSection?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                className="px-6 py-3 bg-white border-2 border-[#3182ce] text-[#3182ce] rounded-xl font-bold hover:bg-[#3182ce]/10 transition-all inline-flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                <span>查看详细权益对比</span>
              </button>
            </div>
          </div>
        )}

        {/* 会员等级 Tab */}
        {activeTab === "membership" && (
          <div className="mb-16 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-black text-slate-800 mb-2">
                会员等级
              </h3>
              <p className="text-slate-600">
                控制团队规模、组件数量、存储空间和使用配额
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {membershipPlans.map((plan) => {
                const Icon = plan.icon;
                const isCurrentPlan = currentMembership === plan.level;
                const price =
                  billingPeriod === "monthly"
                    ? plan.priceMonthly
                    : plan.priceYearly;

                return (
                  <div
                    key={plan.level}
                    className={`relative rounded-2xl p-6 transition-all duration-300 hover:-translate-y-2 ${
                      plan.recommended || plan.popular
                        ? "bg-gradient-to-br from-[#3182ce]/10 to-[#2b6cb0]/10 border-2 border-[#3182ce] shadow-xl shadow-[#3182ce]/20"
                        : "bg-white/80 backdrop-blur-xl border-2 border-slate-200 hover:border-[#3182ce]/40 hover:shadow-xl"
                    }`}
                  >
                    {/* 标签 */}
                    {(plan.recommended || plan.popular) && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span
                          className={`text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 ${
                            plan.popular
                              ? "bg-gradient-to-r from-[#f59e0b] to-[#d97706]"
                              : "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0]"
                          }`}
                        >
                          {plan.popular ? (
                            <>
                              <Star className="w-3 h-3" />
                              最受欢迎
                            </>
                          ) : (
                            <>
                              <TrendingUp className="w-3 h-3" />
                              推荐
                            </>
                          )}
                        </span>
                      </div>
                    )}

                    {/* 图标和名称 */}
                    <div className="text-center mb-5">
                      <div
                        className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center shadow-lg`}
                      >
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-xl font-black text-slate-800 mb-1">
                        {plan.nameZh}
                      </h3>
                      <p className="text-xs text-slate-600 mb-3">
                        {plan.description}
                      </p>
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-4xl font-black text-slate-800">
                          ¥{price}
                        </span>
                        <span className="text-slate-500 font-medium">
                          {billingPeriod === "monthly" ? "/月" : "/年"}
                        </span>
                      </div>
                    </div>

                    {/* 功能列表 */}
                    <div className="space-y-2.5 mb-6">
                      {plan.features.map((feature, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Check className="w-4 h-4 text-[#10b981] flex-shrink-0 mt-0.5" />
                          <span className="text-slate-700">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* 操作按钮 */}
                    <button
                      onClick={() => handleUpgradeMembership(plan.level)}
                      disabled={loading || isCurrentPlan}
                      className={`w-full py-3 rounded-xl font-bold transition-all ${
                        isCurrentPlan
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : `bg-gradient-to-r ${plan.gradient} text-white hover:shadow-lg hover:shadow-[${plan.color}]/30 hover:-translate-y-0.5`
                      }`}
                    >
                      {isCurrentPlan ? "当前套餐" : "立即升级"}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 权益对比表链接 */}
            <div className="mt-8 text-center">
              <button
                onClick={() => {
                  const tableSection =
                    document.getElementById("comparison-table");
                  tableSection?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
                className="px-6 py-3 bg-white border-2 border-[#f59e0b] text-[#f59e0b] rounded-xl font-bold hover:bg-[#f59e0b]/10 transition-all inline-flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                <span>查看详细权益对比</span>
              </button>
            </div>
          </div>
        )}

        {/* 详细权益对比表 */}
        <div
          id="comparison-table"
          className="bg-white/80 backdrop-blur-xl rounded-2xl border-2 border-slate-200 p-8 mb-12"
        >
          <h3 className="text-2xl font-bold text-slate-800 mb-6 text-center">
            会员等级权益对比
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-4 px-4 font-bold text-slate-700">
                    权益项
                  </th>
                  {membershipPlans.map((plan) => (
                    <th
                      key={plan.level}
                      className="text-center py-4 px-4 font-bold"
                      style={{ color: plan.color }}
                    >
                      {plan.nameZh}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-4 px-4 text-slate-700 flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    团队规模
                  </td>
                  {membershipPlans.map((plan) => (
                    <td key={plan.level} className="text-center py-4 px-4">
                      {plan.level === "CROWN" ? (
                        <span className="font-bold text-[#10b981]">无限</span>
                      ) : (
                        <span className="text-slate-700">
                          {getMembershipConfig(plan.level).maxTeamSize}人
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-4 px-4 text-slate-700 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    空间配额
                  </td>
                  {membershipPlans.map((plan) => (
                    <td key={plan.level} className="text-center py-4 px-4">
                      {plan.level === "CROWN" ? (
                        <span className="font-bold text-[#10b981]">
                          1 个个人空间
                          <br />+ 无限企业空间
                        </span>
                      ) : (
                        <span className="text-slate-700">
                          1 个个人空间
                          <br />+{" "}
                          {
                            getMembershipConfig(plan.level)
                              .maxEnterpriseWorkspaces
                          }
                          个企业空间
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-4 px-4 text-slate-700 flex items-center gap-2">
                    <Box className="w-4 h-4 text-slate-400" />
                    组件数量
                  </td>
                  {membershipPlans.map((plan) => (
                    <td key={plan.level} className="text-center py-4 px-4">
                      {plan.level === "CROWN" ? (
                        <span className="font-bold text-[#10b981]">无限</span>
                      ) : (
                        <span className="text-slate-700">
                          {getMembershipConfig(plan.level).maxComponents}个
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-4 px-4 text-slate-700 flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-400" />
                    存储空间
                  </td>
                  {membershipPlans.map((plan) => (
                    <td key={plan.level} className="text-center py-4 px-4">
                      {plan.level === "CROWN" ? (
                        <span className="font-bold text-[#10b981]">无限</span>
                      ) : (
                        <span className="text-slate-700">
                          {(
                            getMembershipConfig(plan.level).maxStorage / 1024
                          ).toFixed(0)}
                          GB
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-4 px-4 text-slate-700 flex items-center gap-2">
                    <Code className="w-4 h-4 text-slate-400" />
                    组件库权限
                  </td>
                  {membershipPlans.map((plan) => (
                    <td key={plan.level} className="text-center py-4 px-4">
                      {plan.level === "FREE" || plan.level === "BRONZE" ? (
                        <span className="text-slate-600">基础</span>
                      ) : plan.level === "DIAMOND" || plan.level === "CROWN" ? (
                        <span className="font-bold text-[#f59e0b]">
                          全量 + 专属
                        </span>
                      ) : (
                        <span className="font-bold text-[#3182ce]">全量</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-4 px-4 text-slate-700 flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-slate-400" />
                    技术支持
                  </td>
                  {membershipPlans.map((plan) => (
                    <td
                      key={plan.level}
                      className="text-center py-4 px-4 text-sm"
                    >
                      {plan.level === "FREE" ? (
                        <span className="text-slate-600">标准</span>
                      ) : plan.level === "CROWN" ? (
                        <span className="font-bold text-[#f59e0b]">
                          7×24 专属
                        </span>
                      ) : (
                        <span className="font-bold text-[#3182ce]">优先</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-4 px-4 text-slate-700 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-400" />
                    数据分析
                  </td>
                  {membershipPlans.map((plan) => (
                    <td key={plan.level} className="text-center py-4 px-4">
                      {plan.level === "FREE" ? (
                        <X className="w-4 h-4 text-slate-300 mx-auto" />
                      ) : plan.level === "CROWN" ? (
                        <span className="font-bold text-[#f59e0b]">
                          高级 + 导出
                        </span>
                      ) : (
                        <Check className="w-4 h-4 text-[#10b981] mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-4 px-4 text-slate-700 flex items-center gap-2">
                    <Palette className="w-4 h-4 text-slate-400" />
                    主题自定义
                  </td>
                  {membershipPlans.map((plan) => (
                    <td key={plan.level} className="text-center py-4 px-4">
                      {plan.level === "FREE" || plan.level === "BRONZE" ? (
                        <X className="w-4 h-4 text-slate-300 mx-auto" />
                      ) : plan.level === "GOLD" ||
                        plan.level === "DIAMOND" ||
                        plan.level === "CROWN" ? (
                        <span className="font-bold text-[#f59e0b]">
                          完全自定义
                        </span>
                      ) : (
                        <Check className="w-4 h-4 text-[#10b981] mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 常见问题 */}
        <div className="mt-12 bg-white/80 backdrop-blur-xl rounded-2xl border-2 border-slate-200 p-8">
          <h3 className="text-2xl font-bold text-slate-800 mb-6 text-center">
            常见问题
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            <div>
              <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#3182ce] text-white flex items-center justify-center text-xs font-black">
                  Q
                </span>
                会员等级和空间类型有什么区别？
              </h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                会员等级控制您的团队规模、组件数量、存储空间等配额限制；空间类型决定您使用的协作环境和功能权限。两者配合使用，满足不同场景需求。
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#3182ce] text-white flex items-center justify-center text-xs font-black">
                  Q
                </span>
                如何升级会员或空间？
              </h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                点击对应套餐卡片下方的"立即升级"按钮，根据提示完成支付即可。支持按月或按年付费，按年付费可享受
                8 折优惠。
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#3182ce] text-white flex items-center justify-center text-xs font-black">
                  Q
                </span>
                可以降级或取消会员吗？
              </h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                可以。您可以随时降级到免费版或取消会员，当前会员权益将持续到本期结束。
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#3182ce] text-white flex items-center justify-center text-xs font-black">
                  Q
                </span>
                企业版支持私有化部署吗？
              </h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                是的，皇冠会员支持私有化部署和定制开发服务。请联系客服获取详细方案和报价。
              </p>
            </div>
          </div>
        </div>

        {/* 联系客服 CTA */}
        <div className="mt-8 text-center">
          <p className="text-slate-600 mb-4">需要定制化方案或有其他疑问？</p>
          <button
            onClick={() => toast.info("客服功能开发中")}
            className="px-6 py-3 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-bold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all inline-flex items-center gap-2"
          >
            <MessageSquare className="w-4 h-4" />
            联系客服
          </button>
        </div>
      </main>
    </div>
  );
}
