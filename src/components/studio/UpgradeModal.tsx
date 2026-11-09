"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import { resolveUpgradeResponse } from "@/lib/upgrade-response-protocol";

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
  features: string[];
}

interface ContactManager {
  name: string;
  hotline: string;
  email: string;
}

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  workspaceType: string;
  /** 待升级的空间 ID（个人空间升级为企业空间的真闭环入参） */
  workspaceId: string;
  /** 升级成功后的回调（免费套餐直接开通时触发） */
  onSuccess?: () => void;
}

export default function UpgradeModal({ open, onClose, workspaceType, workspaceId, onSuccess }: UpgradeModalProps) {
  const toast = useToast();
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [targetPlan, setTargetPlan] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<"MONTH" | "YEAR">("YEAR");
  const [managers, setManagers] = useState<ContactManager[]>([]);
  const [loading, setLoading] = useState(false);

  // 打开弹窗时拉取真实可购套餐（默认选中最低档）与客户经理兜底联系方式
  useEffect(() => {
    if (!open) return;
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
    fetch("/api/contact-info")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setManagers(d?.managers || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const selected = plans.find((p) => p.key === targetPlan) || null;
  const price = selected ? (billingCycle === "YEAR" ? selected.priceYearly : selected.priceMonthly) : 0;

  const handleUpgrade = async () => {
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
          workspaceId,
          option: "upgrade",
          targetPlan,
          billingCycle,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // [R0-A5 E5] 三入口统一协议：先验证业务成功（success===true），再处理支付地址/免费完成；
        // success:false 携带 payUrl 不得跳转收银台
        const action = resolveUpgradeResponse(data);
        if (action.kind === "pay_redirect") {
          // 待支付：跳转收银台，不写已开通标记、不触发完成回调
          window.location.href = action.payUrl;
          return;
        }
        if (action.kind === "free_success") {
          // 仅真实免费开通完成才触发完成回调
          toast.success(action.message);
          onSuccess?.();
          onClose();
          return;
        }
        if (action.kind === "pending") {
          // success:true 但缺 payUrl/free → 待处理/异常响应，不当已开通
          toast.info(action.message);
          return;
        }
        // failed：success:false 或协议不完整
        toast.error(action.message);
        return;
      }
      // HTTP 错误：显示错误说明
      toast.error(data.message || data.error || "升级失败，请稍后重试");
    } catch {
      toast.error("网络异常，升级请求未完成，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl text-left border border-slate-100 space-y-4 max-h-[85vh] overflow-y-auto">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <span>升级工作空间服务配额与额度限制</span>
        </h3>
        <p className="text-xs text-slate-500 font-bold leading-relaxed">
          {workspaceType === "PERSONAL" ? "个人空间" : "空间"}当前处于免费自主沙盒套餐下。选择企业套餐后完成开通：
        </p>

        {plansLoading ? (
          <div className="text-xs text-slate-500 py-4 text-center">正在加载套餐…</div>
        ) : plans.length === 0 ? (
          <div className="space-y-2 text-xs text-slate-700 bg-slate-50 p-3 rounded border">
            <p>当前暂无可在线购买的企业套餐，请联系客户经理开通：</p>
            {managers.map((m, i) => (
              <p key={i}>
                • {m.name}：{m.hotline} / {m.email}
              </p>
            ))}
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {plans.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTargetPlan(p.key)}
                  className={`w-full text-left p-2.5 rounded border text-xs transition-colors cursor-pointer ${
                    targetPlan === p.key
                      ? "border-amber-500 bg-amber-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>{p.name}</span>
                    <span>
                      ¥{p.priceYearly}/年 或 ¥{p.priceMonthly}/月
                    </span>
                  </div>
                  <div className="text-slate-500 mt-1">
                    协作上限 {p.maxMembers} 人 · 组件 {p.maxComponents} 个
                    {p.features?.length ? ` · ${p.features.slice(0, 2).join("、")}` : ""}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2 text-xs">
              {(["MONTH", "YEAR"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setBillingCycle(c)}
                  className={`px-3 py-1.5 rounded border font-bold cursor-pointer ${
                    billingCycle === c ? "border-amber-500 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600"
                  }`}
                >
                  {c === "MONTH" ? "月付" : "年付"}
                </button>
              ))}
              {selected && (
                <span className="ml-auto self-center text-slate-700 font-bold">
                  应付：¥{price}
                </span>
              )}
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg cursor-pointer">
            取消
          </button>
          <button
            onClick={handleUpgrade}
            disabled={loading || plansLoading || plans.length === 0}
            className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold rounded-lg shadow hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "正在提交…" : "立即开通"}
          </button>
        </div>
      </div>
    </div>
  );
}
