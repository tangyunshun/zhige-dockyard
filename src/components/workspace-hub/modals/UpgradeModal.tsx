"use client";

import React, { useState, useEffect } from "react";
import { Building2, Layers, Shuffle, ArrowRight, ShieldAlert, Crown } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Workspace, EnterpriseQuota } from "@/hooks/useWorkspaceHubData";
import { getAuthToken } from "@/utils/auth";

interface PlanOption {
  key: string;
  name: string;
  description?: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxMembers: number;
  maxComponents: number;
  maxStorage: number | string;
  maxApiCalls: number;
  trialGift: { enabled: boolean; points: number; expireDays?: number } | null;
  features: string[];
  sortOrder: number;
}

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  personalWorkspace: Workspace | null;
  quota: EnterpriseQuota | null;
  onUpgradeSuccess: () => void;
}

export default function UpgradeModal({
  isOpen,
  onClose,
  personalWorkspace,
  quota,
  onUpgradeSuccess,
}: UpgradeModalProps) {
  const toast = useToast();
  const [option, setOption] = useState<"retain" | "upgrade" | "delete">("upgrade");
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [targetPlan, setTargetPlan] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<"MONTH" | "YEAR">("YEAR");

  // 打开弹窗时拉取可在线购买的企业套餐（默认选中最低档，周期默认年付）
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setPlansLoading(true);
    fetch("/api/workspace/upgrade/plans")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: PlanOption[] = d?.data?.plans || [];
        setPlans(list);
        setTargetPlan((prev) => (prev && list.some((p) => p.key === prev) ? prev : list[0]?.key || ""));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen || !personalWorkspace) return null;

  const handleUpgrade = async () => {
    if (quota && quota.enterpriseCount >= quota.maxEnterprise) {
      toast.error(`您当前最多可拥有 ${quota.maxEnterprise} 个企业空间，无法升级。请先升级会员套餐。`);
      return;
    }
    if (!targetPlan) {
      toast.error("请选择企业套餐");
      return;
    }

    try {
      setLoading(true);
      const authToken = getAuthToken();
      if (!authToken) {
        toast.error("未授权访问，请重新登录");
        return;
      }

      const res = await fetch("/api/workspace/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        credentials: "include",
        body: JSON.stringify({
          workspaceId: personalWorkspace.id,
          option,
          targetPlan,
          billingCycle,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "空间升级成功！");
        
        // 写入客户端 localStorage 升级标记
        localStorage.setItem("personalWorkspaceUpgraded", "true");
        if (option === "retain") {
          localStorage.setItem("upgradeMode", "parallel");
        } else if (option === "upgrade") {
          localStorage.setItem("upgradeMode", "replace");
        } else if (option === "delete") {
          localStorage.setItem("upgradeMode", "migrate");
          localStorage.setItem("personalWorkspaceDeleted", "true");
        }

        onUpgradeSuccess();
        onClose();
      } else {
        toast.error(data.error || "升级失败，请重试");
      }
    } catch (error) {
      console.error("Upgrade personal workspace error:", error);
      toast.error("网络请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative animate-in fade-in zoom-in duration-200">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all border-none cursor-pointer text-slate-500 text-xl font-bold"
          disabled={loading}
        >
          ×
        </button>

        {/* 头部标题 */}
        <div className="mb-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2b6cb0] to-[#3182ce] flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">升级为企业空间</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                开启企业协作空间，支持团队研发协同并提供专属计算算力资源
              </p>
            </div>
          </div>
        </div>

        {/* 升级方案选择 */}
        <div className="space-y-4 mb-6">
          <h3 className="text-xs font-bold text-slate-700">请选择升级模式：</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 并行模式 */}
            <div
              onClick={() => !loading && setOption("retain")}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between h-[180px] ${
                option === "retain"
                  ? "border-amber-500 bg-amber-50/20"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded ${option === "retain" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                    <Layers className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">并行模式</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  保留原个人空间与全部沙箱配置，同时额外为您开辟一个新的企业协作空间。
                </p>
              </div>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-100/60 px-2 py-0.5 rounded self-start mt-2">
                适合独立沙箱与团队并存
              </span>
            </div>

            {/* 替换模式 */}
            <div
              onClick={() => !loading && setOption("upgrade")}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between h-[180px] ${
                option === "upgrade"
                  ? "border-[#2b6cb0] bg-blue-50/20"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded ${option === "upgrade" ? "bg-blue-100 text-[#2b6cb0]" : "bg-slate-100 text-slate-500"}`}>
                    <Building2 className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">替换模式 (推荐)</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  保留当前个人工作空间的同时，额外创建一个企业协作空间，个人空间与企业空间并存、资产各自独立。
                </p>
              </div>
              <span className="text-[10px] font-bold text-[#2b6cb0] bg-blue-100/60 px-2 py-0.5 rounded self-start mt-2">
                适合直接转化业务主体
              </span>
            </div>

            {/* 迁移模式 */}
            <div
              onClick={() => !loading && setOption("delete")}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between h-[180px] ${
                option === "delete"
                  ? "border-red-500 bg-red-50/10"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded ${option === "delete" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                    <Shuffle className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-slate-800">迁移模式</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  创建一个新的企业空间，并将您个人工作空间的数据迁移过去，最后将原个人空间删除。
                </p>
              </div>
              <span className="text-[10px] font-bold text-red-600 bg-red-100/60 px-2 py-0.5 rounded self-start mt-2">
                适合彻底迁移并清空沙箱
              </span>
            </div>
          </div>
        </div>

        {/* 企业套餐选择 */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700">请选择企业套餐：</h3>
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {(["MONTH", "YEAR"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => !loading && setBillingCycle(c)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer border-none ${
                    billingCycle === c
                      ? "bg-white text-[#2b6cb0] shadow-sm"
                      : "bg-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {c === "MONTH" ? "月付" : "年付"}
                </button>
              ))}
            </div>
          </div>

          {plansLoading ? (
            <div className="py-6 text-center text-xs text-slate-400 font-semibold">套餐加载中...</div>
          ) : plans.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 font-semibold">
              暂无可在线购买的企业套餐，请联系专属架构师
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {plans.map((p) => {
                const price = billingCycle === "MONTH" ? p.priceMonthly : p.priceYearly;
                const selected = targetPlan === p.key;
                return (
                  <div
                    key={p.key}
                    onClick={() => !loading && setTargetPlan(p.key)}
                    className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                      selected
                        ? "border-[#2b6cb0] bg-blue-50/30"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xs font-black text-slate-800">{p.name}</span>
                      {selected && (
                        <span className="text-[10px] font-bold text-[#2b6cb0]">已选</span>
                      )}
                    </div>
                    <div className="mb-1.5">
                      {price > 0 ? (
                        <>
                          <span className="text-base font-black text-[#2b6cb0]">¥{price / 100}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">
                            /{billingCycle === "MONTH" ? "月" : "年"}
                          </span>
                        </>
                      ) : (
                        <span className="text-base font-black text-[#2b6cb0]">免费</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      {p.maxMembers} 个成员席位 · {p.maxComponents} 个组件
                      {p.trialGift?.enabled && p.trialGift.points > 0
                        ? ` · 送 ${p.trialGift.points} 点算力`
                        : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 友情提醒 */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-800">升级安全提示：</h4>
              <p className="text-xs text-amber-600 leading-relaxed mt-0.5">
                {option === "upgrade" && "替换升级后，个人沙箱将无法单独进入，所有组件将合并为企业所有，企业内的其他管理员将获得其管理权限。"}
                {option === "retain" && "并行升级将额外消耗 1 个企业空间容量指标。目前这不会影响您现有的个人开发空间数据。"}
                {option === "delete" && "迁移模式会进行安全前置检测：如果个人空间含有进行中的组件任务、未转移的外部项目或存在其他协同成员，升级操作将被拦截。"}
              </p>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-all border-none cursor-pointer"
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleUpgrade}
            disabled={loading || plansLoading || !targetPlan}
            className="flex-1 py-2 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all border-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>正在处理升级...</span>
              </>
            ) : (
              <>
                <span>确认升级</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
