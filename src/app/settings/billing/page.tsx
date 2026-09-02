"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { 
  CreditCard, Zap, Shield, ChevronRight, ArrowLeft, RefreshCw, 
  Download, Clock, CheckCircle2, AlertCircle, Sparkles, Layers,
  Receipt, BarChart2, Plus, ArrowUpRight
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { formatTokenBalance, isUnlimitedToken } from "@/utils/quota";
import Footer from "@/components/Footer";

interface BillingRecord {
  id: string;
  type: string;
  amount: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
  date: string;
  invoiceUrl?: string;
}

/** 推算次月 1 日，作为算力重置日期的兜底值（避免硬编码日期随时间过期） */
function getNextMonthFirstDay(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/** 格式化账单时间：YYYY-MM-DD HH:mm */
function formatBillingDate(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 套餐限额格式化：-1 表示无限制 */
function formatPlanLimit(value: number | undefined, unit: string): string {
  if (value === undefined || value === null) return "-";
  return value === -1 ? "无限制" : `${value.toLocaleString("zh-CN")} ${unit}`;
}

export default function BillingSettingsPage() {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [workspaceQuota, setWorkspaceQuota] = useState<any>({
    membershipLevel: "FREE",
    membershipLevelName: "免费体验版",
    tokenBalance: 0,
    totalUsedTokens: 0,
    // 后端未返回重置日期时，动态推算次月 1 日，避免写死日期过期
    renewDate: getNextMonthFirstDay(),
    workspaceId: null,
  });
  const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);

  // 空间级套餐：由空间中枢「升级空间套餐」入口携带 ?workspaceId= 进入
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<any>(null);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  /** 拉取账单流水（数据库 billing_record 表）：账号级全量，会员升级与空间套餐升级两类记录均包含，互不覆盖 */
  const loadBillingRecords = async (authToken: string | null) => {
    try {
      const billRes = await fetch(`/api/billing/records`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (billRes.ok) {
        const bData = await billRes.json();
        if (bData.success && Array.isArray(bData.data)) {
          setBillingHistory(
            bData.data.map((r: any) => ({
              id: r.id,
              type: r.title,
              amount: `¥ ${(r.amount / 100).toFixed(2)}`,
              status: r.status,
              date: formatBillingDate(r.date),
            }))
          );
        }
      }
    } catch (err) {
      console.error("加载账单流水失败:", err);
    }
  };

  /** 拉取指定空间的套餐与可升级选项 */
  const loadWorkspacePlan = async (wsId: string, authToken: string | null) => {
    try {
      const res = await fetch(`/api/workspace/upgrade-plan?workspaceId=${wsId}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setPlanData(data.data);
      } else {
        setPlanData(null);
      }
    } catch (err) {
      console.error("加载空间套餐失败:", err);
    }
  };

  /** 执行空间套餐升级 */
  const handleUpgradePlan = async (targetPlan: string) => {
    if (!workspaceId) return;
    setUpgradingPlan(targetPlan);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/upgrade-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ workspaceId, targetPlan }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "空间套餐升级成功");
        // 刷新套餐状态与账单流水（升级会产生一条新的交易记录）
        await loadWorkspacePlan(workspaceId, authToken);
        await loadBillingRecords(authToken);
      } else {
        toast.error(data.error || "空间套餐升级失败");
      }
    } catch (err) {
      console.error("升级空间套餐失败:", err);
      toast.error("网络异常，空间套餐升级失败");
    } finally {
      setUpgradingPlan(null);
    }
  };

  const loadBillingData = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();

      // 0. 解析 URL 上的空间 ID（由空间中枢「升级空间套餐」入口携带）
      const wsId = new URLSearchParams(window.location.search).get("workspaceId");
      setWorkspaceId(wsId);
      if (wsId) {
        await loadWorkspacePlan(wsId, authToken);
      }

      // 1. 获取用户信息
      const userRes = await fetch("/api/auth/me", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (userRes.ok) {
        const uData = await userRes.json();
        setUserInfo(uData.user || null);
      }

      // 2. 获取真实会员等级与算力配额（无 workspaceId 读账号级，有则读该空间配额）
      const quotaRes = await fetch(
        `/api/workspace/quota${wsId ? `?workspaceId=${encodeURIComponent(wsId)}` : ""}`,
        { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} }
      );
      if (quotaRes.ok) {
        const qData = await quotaRes.json();
        if (qData.success) {
          const resetAt = qData.resetAt ? qData.resetAt.slice(0, 10) : getNextMonthFirstDay();
          setWorkspaceQuota({
            membershipLevel: qData.membershipLevel || "FREE",
            membershipLevelName: qData.membershipLevelName || qData.membershipLevel || "免费体验版",
            tokenBalance: qData.tokenBalance ?? 0,
            totalUsedTokens: qData.totalUsedTokens || 0,
            renewDate: resetAt,
            workspaceId: wsId || qData.quota?.workspaceId || null,
          });
        }
      }

      // 3. 拉取真实账单流水（账号级全部交易：会员升级 + 空间套餐升级，两类互不覆盖）
      await loadBillingRecords(authToken);
    } catch (err) {
      console.error("加载账单数据失败:", err);
      toast.error("加载账单数据失败，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  // 真实导出并生成物理电子凭证下载
  const handleDownloadInvoice = (invId: string) => {
    const inv = billingHistory.find((b) => b.id === invId) || {
      id: invId,
      type: "知阁·舟坊算力充值交易凭证",
      amount: "¥ 0.00",
      date: new Date().toLocaleString(),
    };
    const content = `# 知阁·舟坊 官方电子交易对账凭证\n\n**凭证编号**: ${inv.id}\n**交易类型**: ${inv.type}\n**交易金额**: ${inv.amount}\n**交易时间**: ${inv.date}\n**盖章单位**: 知阁·舟坊 研发协作中枢结算中心\n\n---\n*本电子凭证由 MySQL 数据库交易日志自动生成，具备物理查验效力。*`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Invoice_${inv.id}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`交易凭证 [${invId}] 已成功导出并触发下载`);
  };

  // 电子发票开具状态 Modal
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [taxId, setTaxId] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [submittingInvoice, setSubmittingInvoice] = useState(false);

  const handleSubmitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceTitle.trim()) {
      toast.error("请输入发票开具抬头");
      return;
    }
    try {
      setSubmittingInvoice(true);
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "invoice",
          title: `发票开具申请: ${invoiceTitle}`,
          content: `开票抬头: ${invoiceTitle}\n纳税人识别号: ${taxId || '无'}\n接收邮箱: ${invoiceEmail || userInfo?.email || '无'}`,
          contact: invoiceEmail || userInfo?.email || ""
        })
      });
      if (res.ok) {
        toast.success("电子发票开具申请已成功提交至工单中心，系统将在 1 个工作日内发送至您的邮箱！");
        setIsInvoiceModalOpen(false);
        setInvoiceTitle("");
        setTaxId("");
      } else {
        toast.error("提交发票申请失败，请稍后重试");
      }
    } catch (e) {
      toast.error("网络提交失败");
    } finally {
      setSubmittingInvoice(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 flex flex-col font-sans selection:bg-[#3182ce]/20 selection:text-[#2b6cb0]">
      {/* 顶部导航控制台 */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-30 px-4 lg:px-8 py-2 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all cursor-pointer border border-slate-200"
            title="返回上一页"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-sm shadow-[#3182ce]/20">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              账单与算力配额
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-100 font-bold">
                Billing Settings
              </span>
            </h1>
          </div>
        </div>

        <button
          onClick={() => router.push("/pricing?redirect=billing")}
          className="h-8 px-3 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold shadow-sm shadow-[#3182ce]/20 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>升级套餐 / 充值</span>
        </button>
      </header>

      {/* 主体页面内容 */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6 text-left">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 border-3 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-bold">正在从数据库拉取账单与算力配额数据...</p>
          </div>
        ) : (
          <>
            {/* 空间套餐升级（仅当从空间卡片「升级空间套餐」入口携带 workspaceId 进入时展示） */}
            {planData && (
              <section className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/80 p-6 shadow-xs text-left">
                <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#3182ce]" />
                      空间套餐
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      空间「
                      <span className="font-bold text-slate-700">{planData.workspace?.name}</span>
                      」当前为
                      <span className="font-bold text-[#2b6cb0]"> {planData.currentPlan?.name}</span>
                      （{planData.currentPlan?.description}）
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-md bg-blue-50 text-[#2b6cb0] border border-blue-100">
                    {planData.currentPlan?.key}
                  </span>
                </div>

                {/* 当前套餐配额速览 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "团队席位", value: formatPlanLimit(planData.currentPlan?.maxMembers, "人") },
                    { label: "组件装配额度", value: formatPlanLimit(planData.currentPlan?.maxComponents, "个") },
                    { label: "云端存储", value: planData.currentPlan?.maxStorage === -1 ? "无限制" : `${(planData.currentPlan.maxStorage / 1024).toFixed(0)} GB` },
                    { label: "每月调用额度", value: formatPlanLimit(planData.currentPlan?.maxApiCalls, "次") },
                  ].map((item) => (
                    <div key={item.label} className="bg-slate-50/70 rounded-lg p-3 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider mb-1">
                        {item.label}
                      </span>
                      <span className="text-sm font-black text-slate-700">{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* 全部空间套餐列表：当前套餐高亮、低阶禁用、高阶可升级 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {planData.allPlans.map((plan: any) => {
                    const isCurrent = plan.key === planData.currentPlan?.key;
                    const isUpgrade = plan.sortOrder > planData.currentPlan?.sortOrder;
                    const isDowngrade = plan.sortOrder < planData.currentPlan?.sortOrder;
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
                            ¥{plan.priceMonthly / 100}
                            <span className="text-[10px] text-slate-400 font-bold">/月</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mb-3">{plan.description}</p>

                        <ul className="space-y-1.5 mb-4 flex-1">
                          {plan.features.map((f: string) => (
                            <li key={f} className="flex items-start gap-1.5 text-[11px] text-slate-600 font-semibold">
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
                              升级中...
                            </>
                          ) : isCurrent ? (
                            "当前套餐"
                          ) : isDowngrade ? (
                            "不支持降级"
                          ) : (
                            <>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              升级到{plan.name}
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {!planData.canUpgrade && (
                  <div className="mt-4 p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl">
                    <p className="text-xs text-emerald-700 font-bold leading-relaxed">
                      当前空间已是在线可购买最高套餐。如需进一步定制席位与存储，请联系专属架构师走线下定制方案。
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* 顶栏卡片矩阵：会员层级 & 算力余额 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* 卡片 1: 当前会员订阅 */}
              <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">当前会员订阅</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />
                      生效中
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-1 flex items-center gap-2">
                    {workspaceQuota.membershipLevel === "FREE" ? "免费体验版" : (workspaceQuota.membershipLevelName || workspaceQuota.membershipLevel)}
                    <Sparkles className="w-4 h-4 text-amber-500 fill-amber-400" />
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    下次自动重置时间: <span className="font-bold text-slate-700">{workspaceQuota.renewDate}</span>
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-semibold">支持全系统 60 个通用组件拉起</span>
                  <button
                    onClick={() => router.push("/pricing")}
                    className="text-xs font-bold text-[#3182ce] hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    切换计划 <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 卡片 2: 算力 Token 剩余 */}
              <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">可用算力 Token 余额</span>
                    <span className="text-[11px] font-extrabold text-[#3182ce] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      实时扣减中
                    </span>
                  </div>
                  <h2 className="text-2xl font-black text-[#2b6cb0] tracking-tight mb-1 font-mono">
                    {formatTokenBalance(workspaceQuota.tokenBalance)} <span className="text-xs font-bold text-slate-400 font-sans">Tokens</span>
                  </h2>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3 mb-1">
                    <div 
                      className="bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] h-full rounded-full transition-all duration-500"
                      style={{ width: `${isUnlimitedToken(workspaceQuota.tokenBalance) ? 100 : Math.min(100, Math.max(10, (workspaceQuota.tokenBalance / 50000) * 100))}%` }}
                    />
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>累计已消耗: <strong className="text-slate-700">{workspaceQuota.totalUsedTokens}</strong> Tokens</span>
                  <button
                    onClick={() => {
                      if (workspaceQuota.workspaceId) {
                        router.push(`/workspace/${workspaceQuota.workspaceId}/members`);
                      } else {
                        router.push("/pricing");
                      }
                    }}
                    className="text-xs font-bold text-[#3182ce] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5 fill-[#3182ce]" />
                    <span>充值算力包</span>
                  </button>
                </div>
              </div>

              {/* 卡片 3: 企业发票与企业专属协议 */}
              <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/80 p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">发票与企业对公发票</span>
                    <Receipt className="w-4 h-4 text-slate-400" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-800 mb-1">
                    增值税电子普通 / 专用发票
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    支持按个人或企业抬头一键开具，开票历史随时可查与 PDF 凭证导出。
                  </p>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => setIsInvoiceModalOpen(true)}
                    className="h-8 px-3 rounded-md bg-[#2b6cb0] hover:bg-[#3182ce] text-xs font-bold text-white shadow-xs transition-all cursor-pointer inline-flex items-center gap-1"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    在线申请开票
                  </button>
                  <button
                    onClick={() => router.push("/docs")}
                    className="text-xs font-bold text-slate-500 hover:text-[#3182ce] transition-colors cursor-pointer flex items-center gap-0.5"
                  >
                    查看计费规则 <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* 账单历史列表 Panel */}
            <div className="bg-white/80 backdrop-blur-md rounded-xl border border-slate-200/80 p-6 shadow-xs text-left space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#3182ce]" />
                    账单与充值交易历史 (Billing History)
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    展示在知阁·舟坊平台产生的所有算力购买与额度自动分配明细
                  </p>
                </div>

                <button
                  onClick={loadBillingData}
                  className="h-8 px-3 rounded-md border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  刷新
                </button>
              </div>

              {/* 列表表格 */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 font-bold">
                      <th className="py-3 px-4 rounded-l-lg">账单流水单号</th>
                      <th className="py-3 px-4">描述说明</th>
                      <th className="py-3 px-4">交易金额</th>
                      <th className="py-3 px-4">扣减/充值日期</th>
                      <th className="py-3 px-4">状态</th>
                      <th className="py-3 px-4 text-right rounded-r-lg">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {billingHistory.map((rec) => (
                      <tr key={rec.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-slate-900 font-bold">{rec.id}</td>
                        <td className="py-3.5 px-4 font-semibold">{rec.type}</td>
                        <td className="py-3.5 px-4 font-bold text-emerald-600">{rec.amount}</td>
                        <td className="py-3.5 px-4 text-slate-500">{rec.date}</td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-600 border border-emerald-200">
                            ● 交易成功
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleDownloadInvoice(rec.id)}
                            className="text-[#3182ce] hover:underline font-bold text-xs cursor-pointer inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            电子凭证
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* 电子发票开具真实弹窗 Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#3182ce]" />
                增值税电子发票申请
              </h3>
              <button
                onClick={() => setIsInvoiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-base cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitInvoice} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block text-slate-700 font-extrabold mb-1">
                  发票开具抬头 (企业 / 个人名称) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="请输入公司全称或个人抬头"
                  value={invoiceTitle}
                  onChange={(e) => setInvoiceTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-300 focus:border-[#3182ce] focus:outline-none bg-slate-50/50 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-extrabold mb-1">
                  纳税人识别号 / 统一社会信用代码 (企业必填)
                </label>
                <input
                  type="text"
                  placeholder="个人抬头无需填写，企业请输入 18 位税号"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-300 focus:border-[#3182ce] focus:outline-none bg-slate-50/50 text-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-extrabold mb-1">
                  接收电子发票邮箱 <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="开具成功后将发送至该邮箱"
                  value={invoiceEmail}
                  onChange={(e) => setInvoiceEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-slate-300 focus:border-[#3182ce] focus:outline-none bg-slate-50/50 text-slate-800"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="h-8 px-4 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingInvoice}
                  className="h-8 px-4 rounded-md bg-[#2b6cb0] hover:bg-[#3182ce] text-white font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {submittingInvoice ? "提交开票中..." : "确认提交开票申请"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
