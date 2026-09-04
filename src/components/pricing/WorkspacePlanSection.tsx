"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Layers,
  CheckCircle2,
  ArrowUpRight,
  RefreshCw,
  Users,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { getAuthToken } from "@/utils/auth";

interface WorkspacePlanSectionProps {
  /** 目标空间 ID；不传时由后端自动定位当前活跃空间 */
  workspaceId?: string | null;
  /** 升级成功后通知父级刷新（如账单流水） */
  onUpgraded?: () => void;
  /** 紧凑模式：隐藏配额速览矩阵，仅展示套餐阶梯（用于聚合页空间切换场景） */
  compact?: boolean;
}

/** 套餐限额格式化：-1 表示无限制 */
function formatPlanLimit(value: number | undefined, unit: string): string {
  if (value === undefined || value === null) return "-";
  return value === -1 ? "无限制" : `${value.toLocaleString("zh-CN")} ${unit}`;
}

/** 格式化存储空间尺寸（字节 -> MB / GB） */
function formatStorageSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function WorkspacePlanSection({
  workspaceId,
  onUpgraded,
  compact = false,
}: WorkspacePlanSectionProps) {
  const router = useRouter();
  const toast = useToast();
  const { userState } = useAppContext();

  const [planData, setPlanData] = useState<any>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWorkspacePlan = useCallback(async (wsId: string | null) => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const url = wsId
        ? `/api/workspace/upgrade-plan?workspaceId=${encodeURIComponent(wsId)}`
        : `/api/workspace/upgrade-plan`;
      const res = await fetch(url, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setPlanData(data.data);
      } else {
        setPlanData(null);
      }
    } catch (err) {
      console.error("加载空间套餐失败:", err);
      setPlanData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userState.isLoggedIn) {
      loadWorkspacePlan(workspaceId ?? null);
    }
  }, [userState.isLoggedIn, workspaceId, loadWorkspacePlan]);

  /** 执行空间套餐升级（一次性扩容包买断） */
  const handleUpgradePlan = async (targetPlan: string) => {
    if (!planData?.workspace?.id) return;
    setUpgradingPlan(targetPlan);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/upgrade-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          workspaceId: planData.workspace.id,
          targetPlan,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(data.message || "空间套餐扩容成功");
        await loadWorkspacePlan(planData.workspace.id);
        onUpgraded?.();
      } else {
        toast.error(data.error || "空间套餐扩容失败");
      }
    } catch (err) {
      console.error("扩容空间套餐失败:", err);
      toast.error("网络异常，空间套餐扩容失败");
    } finally {
      setUpgradingPlan(null);
    }
  };

  // 未登录：不渲染（登录态才会展示空间扩容包，避免对未登录访客产生无效数据请求）
  if (!userState.isLoggedIn) return null;

  // 加载中：骨架屏
  if (loading) {
    return (
      <section className="bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/80 p-6 shadow-xs text-left">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-4 h-4 rounded bg-[#3182ce]/20 animate-pulse" />
          <div className="h-4 w-40 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="h-20 bg-slate-100/80 rounded-xl animate-pulse" />
      </section>
    );
  }

  // 无可管理空间 / 加载失败：降级为引导创建空间
  if (!planData?.workspace) {
    return (
      <section className="bg-white/60 backdrop-blur-md rounded-2xl border border-slate-200/80 p-6 shadow-xs text-left">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#3182ce]" />
              空间团队资源扩容包
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 font-black">
                一次性买断 · 长期生效
              </span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              空间级席位 / 组件装配 / 存储 / 调用额度按需一次性扩容
            </p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-blue-50/60 border border-blue-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-600 font-bold leading-relaxed">
            暂无可扩容的工作空间，请先前往空间中枢创建或加入一个工作空间。
          </p>
          <button
            onClick={() => router.push("/workspace-hub")}
            className="h-8 px-4 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap active:scale-[0.98]"
          >
            <Building2 className="w-3.5 h-3.5" />
            前往空间中枢
          </button>
        </div>
      </section>
    );
  }

  const currentPlan = planData.currentPlan;
  const usage = planData.realtimeUsage;

  /** 实时配额速览指标（与后端实时统计字段一一对应） */
  const membersUsed = usage?.members?.used ?? 1;
  const membersLimit = usage?.members?.limit ?? currentPlan?.maxMembers ?? -1;
  const membersUnlimited = membersLimit === -1;
  const memberPercent = membersUnlimited
    ? 0
    : Math.min(100, Math.round((membersUsed / membersLimit) * 100));

  const componentsUsed = usage?.components?.used ?? 0;
  const componentsLimit = usage?.components?.limit ?? currentPlan?.maxComponents ?? -1;
  const componentsUnlimited = componentsLimit === -1;
  const compPercent = componentsUnlimited
    ? 0
    : Math.min(100, Math.round((componentsUsed / componentsLimit) * 100));

  const storageBytes = usage?.storage?.usedBytes ?? 0;
  const storageLimitMB = usage?.storage?.limitMB ?? currentPlan?.maxStorage ?? -1;
  const storageUnlimited = storageLimitMB === -1;
  const storageUsedMB = storageBytes / (1024 * 1024);
  const storagePercent = storageUnlimited
    ? 0
    : Math.min(100, Math.round((storageUsedMB / storageLimitMB) * 100));

  const apiCallsUsed = usage?.apiCalls?.used ?? 0;
  const apiCallsLimit = usage?.apiCalls?.limit ?? currentPlan?.maxApiCalls ?? -1;
  const apiCallsUnlimited = apiCallsLimit === -1;
  const apiCallsPercent = apiCallsUnlimited
    ? 0
    : Math.min(100, Math.round((apiCallsUsed / apiCallsLimit) * 100));

  const metrics = [
    {
      label: "团队席位",
      primary: `${membersUsed} 人`,
      sub: membersUnlimited ? "席位无限制" : `限额 ${membersLimit} 人`,
      unlimited: membersUnlimited,
      percent: memberPercent,
    },
    {
      label: "组件装配额度",
      primary: `${componentsUsed} 个`,
      sub: componentsUnlimited ? "装配无限制" : `限额 ${componentsLimit} 个`,
      unlimited: componentsUnlimited,
      percent: compPercent,
    },
    {
      label: "云端存储",
      primary: formatStorageSize(storageBytes),
      sub: storageUnlimited ? "存储无限制" : `限额 ${(storageLimitMB / 1024).toFixed(0)} GB`,
      unlimited: storageUnlimited,
      percent: storagePercent,
    },
    {
      label: "API 调用额度",
      primary: `${apiCallsUsed.toLocaleString()} 次`,
      sub: apiCallsUnlimited ? "调用无限制" : `限额 ${apiCallsLimit.toLocaleString()} 次`,
      unlimited: apiCallsUnlimited,
      percent: apiCallsPercent,
    },
  ];

  return (
    <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-6 shadow-xs text-left">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#3182ce]" />
            空间团队资源扩容包
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 font-black">
              一次性买断 · 长期生效
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            空间「
            <span className="font-bold text-slate-700">{planData.workspace?.name}</span>
            」当前为
            <span className="font-bold text-[#2b6cb0]"> {currentPlan?.name}</span>
            （{currentPlan?.description}）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black px-2.5 py-1 rounded-md bg-blue-50 text-[#2b6cb0] border border-blue-100">
            {currentPlan?.key}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100">
            <ShieldCheck className="w-3 h-3" />
            长期生效
          </span>
        </div>
      </div>

      {/* 当前套餐配额速览（100% 真实呈现数据库当前空间的实时使用量与生效配额） */}
      {!compact && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {metrics.map((item) => (
            <div
              key={item.label}
              className="bg-slate-50/80 hover:bg-slate-50 transition-colors rounded-lg p-3.5 border border-slate-100 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {item.label}
                  </span>
                  {item.unlimited ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">
                      无限制
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono font-bold text-slate-400">
                      {item.percent}%
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-base font-black text-slate-800 tracking-tight font-mono">
                    {item.primary}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium block">
                  {item.sub}
                </span>
              </div>

              {!item.unlimited && (
                <div className="w-full bg-slate-200/70 h-1.5 rounded-full overflow-hidden mt-2.5">
                  <div
                    className="bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(4, item.percent)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 全部空间套餐列表：当前套餐高亮、低阶禁用、高阶可升级 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(planData.allPlans || []).map((plan: any) => {
          const isCurrent = plan.key === currentPlan?.key;
          const isUpgrade = plan.sortOrder > currentPlan?.sortOrder;
          const isDowngrade = plan.sortOrder < currentPlan?.sortOrder;
          return (
            <div
              key={plan.key}
              className={`rounded-xl border p-5 bg-white transition-all flex flex-col ${
                isCurrent
                  ? "border-[#3182ce] ring-2 ring-[#3182ce]/20"
                  : isUpgrade
                    ? "border-slate-200/80 hover:border-[#3182ce]/50 hover:shadow-sm"
                    : "border-slate-200/80 opacity-75"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  {plan.name}
                  {isCurrent && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#3182ce] text-white rounded font-bold">
                      当前套餐
                    </span>
                  )}
                </h3>
                <span className="text-xs font-black text-[#2b6cb0]">
                  {plan.priceMonthly > 0 ? `¥${plan.priceMonthly / 100}` : "免费"}
                  {plan.priceMonthly > 0 && (
                    <span className="text-[10px] text-slate-400 font-bold"> 买断</span>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mb-3">{plan.description}</p>

              <ul className="space-y-1.5 mb-4 flex-1">
                {(plan.features || []).map((f: string) => (
                  <li
                    key={f}
                    className="flex items-start gap-1.5 text-[11px] text-slate-600 font-semibold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => isUpgrade && handleUpgradePlan(plan.key)}
                disabled={upgradingPlan !== null || !isUpgrade}
                className="w-full h-9 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-1.5"
              >
                {upgradingPlan === plan.key ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    扩容中...
                  </>
                ) : isCurrent ? (
                  "当前套餐"
                ) : isDowngrade ? (
                  "不支持降级"
                ) : (
                  <>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    扩容至{plan.name}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* 已开通最高档 / 包含不可自助购买档时的线下定制提示 */}
      {!planData.canUpgrade && (
        <div className="mt-4 p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-800 font-bold leading-relaxed">
              当前空间已开通最高档扩容包。如需进一步扩容席位、存储与调用额度，请联系专属架构师走线下定制方案。
            </p>
          </div>
          <button
            onClick={() => router.push("/solutions?consult=true")}
            className="h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap active:scale-[0.98]"
          >
            <Users className="w-3.5 h-3.5" />
            联系专属架构师
          </button>
        </div>
      )}
    </section>
  );
}
