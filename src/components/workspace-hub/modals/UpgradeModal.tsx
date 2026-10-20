"use client";

import React, { useState, useEffect } from "react";
import { Building2, Layers, Shuffle, ArrowRight, ShieldAlert, Crown, Phone, Mail, Copy, MessageSquare, QrCode } from "lucide-react";
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

interface ContactManager {
  name: string;
  hotline: string;
  email: string;
  serviceHours: string;
  qq?: string;
  wechat?: string;
  qqQr?: string;
  wechatQr?: string;
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
  const [managers, setManagers] = useState<ContactManager[]>([]);

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
    // 拉取客户经理联系方式（用于套餐为空时的兜底展示）
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
  }, [isOpen]);

  const copyText = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(`已复制：${text}`))
      .catch(() => {});
  };

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
      if (res.ok && data.success) {
        // 付费套餐：跳转到收银台完成支付，支付成功后服务端才会真正开通企业空间
        if (data.payUrl) {
          window.location.href = data.payUrl;
          return;
        }
        // 免费套餐：无需支付，直接开通
        toast.success(data.message || "空间升级成功！");

        // 写入客户端 localStorage 升级标记
        localStorage.setItem("personalWorkspaceUpgraded", "true");
        if (option === "retain") {
          localStorage.setItem("upgradeMode", "parallel");
        } else if (option === "upgrade") {
          // 原地升级：个人空间直接转企业，不新建、不删除
          localStorage.setItem("upgradeMode", "relabel");
        } else if (option === "delete") {
          // 迁移模式：原个人空间转为只读归档（非删除）
          localStorage.setItem("upgradeMode", "migrate");
          localStorage.setItem("personalWorkspaceArchived", "true");
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden relative animate-in fade-in zoom-in duration-200">
        {/* 头部标题与关闭按钮（固定置顶） */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2b6cb0] to-[#3182ce] flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800">升级为企业空间</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                开启企业协作空间，支持团队研发协同并提供专属计算算力资源
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-all border-none cursor-pointer text-slate-500 text-xl font-bold flex-shrink-0 ml-2"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* 中间可滚动内容区域 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* 升级方案选择 */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700">请选择升级模式：</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-stretch">
              {/* 并行模式 */}
              <div
                onClick={() => !loading && setOption("retain")}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                  option === "retain"
                    ? "border-amber-500 bg-amber-50/20 shadow-xs"
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
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    保留原个人空间与全部沙箱配置，同时额外为您开辟一个新的企业协作空间。
                  </p>
                </div>
                <div className="mt-3 pt-1">
                  <span className="inline-block text-[10px] font-bold text-amber-600 bg-amber-100/60 px-2 py-0.5 rounded leading-normal">
                    适合独立沙箱与团队并存
                  </span>
                </div>
              </div>

              {/* 原地升级模式（推荐） */}
              <div
                onClick={() => !loading && setOption("upgrade")}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                  option === "upgrade"
                    ? "border-[#2b6cb0] bg-blue-50/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1.5 rounded ${option === "upgrade" ? "bg-blue-100 text-[#2b6cb0]" : "bg-slate-100 text-slate-500"}`}>
                      <Building2 className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-800">原地升级模式（推荐）</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    将当前的个人工作空间直接升级为企业协作空间。您原有的数据无需迁移直接保留，并在该空间内直接邀请成员、购买套餐。适合个人业务做大，直接转化为团队。
                  </p>
                </div>
                <div className="mt-3 pt-1">
                  <span className="inline-block text-[10px] font-bold text-[#2b6cb0] bg-blue-100/60 px-2 py-0.5 rounded leading-normal">
                    适合将当前个人业务直接转化为团队业务
                  </span>
                </div>
              </div>

              {/* 迁移模式 */}
              <div
                onClick={() => !loading && setOption("delete")}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                  option === "delete"
                    ? "border-red-500 bg-red-50/10 shadow-xs"
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
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    创建一个新的企业空间，并把您个人空间的全部资料（文档、项目、模型、对话等）迁移过去，原个人空间转为只读归档（数据保留）。
                  </p>
                </div>
                <div className="mt-3 pt-1">
                  <span className="inline-block text-[10px] font-bold text-red-600 bg-red-100/60 px-2 py-0.5 rounded leading-normal">
                    适合彻底迁移并清空沙箱
                  </span>
                </div>
              </div>
            </div>
          </div>

        {/* 企业套餐选择 */}
        <div className="space-y-3">
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
            <div className="py-4 space-y-3">
              <div className="text-center text-xs text-slate-400 font-semibold">
                暂无可在线购买的企业套餐，请联系客户经理
              </div>
              {managers.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {managers.map((m, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/60"
                    >
                      <div className="text-xs font-bold text-slate-800">{m.name || "客户经理"}</div>
                      <a
                        href={`tel:${m.hotline}`}
                        className="flex items-center gap-2 text-xs text-[#2b6cb0] hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5" /> {m.hotline}
                      </a>
                      <a
                        href={`mailto:${m.email}`}
                        className="flex items-center gap-2 text-xs text-[#2b6cb0] hover:underline"
                      >
                        <Mail className="w-3.5 h-3.5" /> {m.email}
                      </a>
                      {m.wechat && (
                        <button
                          type="button"
                          onClick={() => copyText(m.wechat!)}
                          className="flex items-center gap-2 text-xs text-slate-600 hover:text-[#2b6cb0] transition-all"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> 微信：{m.wechat}
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                      {m.qq && (
                        <button
                          type="button"
                          onClick={() => copyText(m.qq!)}
                          className="flex items-center gap-2 text-xs text-slate-600 hover:text-[#2b6cb0] transition-all"
                        >
                          <MessageSquare className="w-3.5 h-3.5" /> QQ：{m.qq}
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                      {(m.wechatQr || m.qqQr) && (
                        <div className="flex gap-3 pt-1">
                          {m.wechatQr && (
                            <img
                              src={m.wechatQr}
                              alt="微信二维码"
                              className="w-24 h-24 rounded-lg border border-slate-200 bg-white"
                            />
                          )}
                          {m.qqQr && (
                            <img
                              src={m.qqQr}
                              alt="QQ 二维码"
                              className="w-24 h-24 rounded-lg border border-slate-200 bg-white"
                            />
                          )}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400">{m.serviceHours}</div>
                    </div>
                  ))}
                </div>
              )}
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
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4.5 h-4.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-800">升级安全提示：</h4>
              <p className="text-xs text-amber-600 leading-relaxed mt-0.5">
                {option === "upgrade" && "原地升级后，您当前的个人工作空间将直接变为企业协作空间，原有的数据与配置全部保留，您可以直接在该空间内邀请成员、购买团队套餐。"}
                {option === "retain" && "并行升级将额外消耗 1 个企业空间容量指标。目前这不会影响您现有的个人开发空间数据。"}
                {option === "delete" && "迁移模式会新建企业空间并完整搬走个人空间的资料，原个人空间转为只读归档（不可再写入、数据不丢），后续在企业空间继续工作。"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 底部操作按钮（固定置底） */}
      <div className="flex-shrink-0 px-5 sm:px-6 py-4 bg-slate-50/90 backdrop-blur-sm border-t border-slate-100 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 transition-all cursor-pointer shadow-xs"
          disabled={loading}
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleUpgrade}
          disabled={loading || plansLoading || !targetPlan}
          className="flex-1 py-2.5 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-xs font-bold rounded-lg hover:shadow-lg transition-all border-none cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
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
