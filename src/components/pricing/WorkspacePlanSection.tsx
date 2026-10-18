"use client";

import React, { useState, useEffect, useCallback } from "react";
import { isAdminRole } from "@/lib/role-utils";
import { useRouter } from "next/navigation";
import {
  Layers,
  CheckCircle2,
  ArrowUpRight,
  RefreshCw,
  Users,
  ShieldCheck,
  Building2,
  Gift,
  MessagesSquare,
  AlertTriangle,
  Phone,
  Mail,
  Send,
  MessageCircle,
  UserPlus,
  Copy,
} from "lucide-react";
import {
  DEFAULT_CONTACT_MANAGERS,
  normalizeContactManagers,
  type ContactManager,
} from "@/constants/contact-info";
import QrLightbox from "@/components/QrLightbox";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { getAuthToken } from "@/utils/auth";
import UpgradeRequestModal from "@/components/pricing/UpgradeRequestModal";
import SeatAddonModal from "@/components/pricing/SeatAddonModal";

/** 快捷「写邮件」调起本机邮箱客户端时预填的邮件主题 */
const CONTACT_MAIL_SUBJECT = "定制方案咨询（来自官网定价页）";

/** 复制文本到剪贴板（优先 Clipboard API，降级 execCommand） */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

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
  // 定制方案咨询弹窗（对应管理端「定制咨询处理」）
  const [showConsult, setShowConsult] = useState(false);
  // 席位增购弹窗
  const [showSeatAddon, setShowSeatAddon] = useState(false);
  // 二维码放大查看浮层（点击二维码打开，支持遮罩/关闭按钮/ESC 关闭）
  const [qrZoom, setQrZoom] = useState<{ src: string; label: string } | null>(null);

  // 客户经理联系方式（1~2 位）：优先取后台「系统设置」配置，接口未就绪时回退到兜底默认值
  const [contactManagers, setContactManagers] =
    useState<ContactManager[]>(DEFAULT_CONTACT_MANAGERS);
  useEffect(() => {
    let alive = true;
    fetch("/api/contact-info")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.success) setContactManagers(normalizeContactManagers(d.managers));
      })
      .catch(() => {
        /* 失败时保持兜底默认值 */
      });
    return () => {
      alive = false;
    };
  }, []);

  // QQ 快捷添加：优先直接调起本机 QQ 客户端（tencent:// 协议）；未安装则提示并打开网页版临时会话兜底
  const handleAddQq = async (qq: string) => {
    const protocolUrl = `tencent://message/?uin=${encodeURIComponent(qq)}&Site=zhige&Menu=yes`;
    const wpaUrl = `https://wpa.qq.com/msgrd?v=3&uin=${encodeURIComponent(qq)}&site=qq&menu=yes`;
    let launched = false;
    const onBlur = () => {
      launched = true;
    };
    window.addEventListener("blur", onBlur);
    // 通过隐藏 iframe 触发协议，避免当前页跳转
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = protocolUrl;
    document.body.appendChild(iframe);
    window.setTimeout(() => {
      document.body.removeChild(iframe);
      window.removeEventListener("blur", onBlur);
      if (!launched) {
        // 未检测到 QQ 客户端调起：提示用户并打开网页版临时会话（或扫码添加）
        toast.warning("未检测到本机 QQ 客户端，已为你打开网页版 QQ 临时会话，也可扫描二维码添加");
        window.open(wpaUrl, "_blank", "noopener,noreferrer");
      }
    }, 1200);
  };

  // 微信快捷添加：复制微信号，轻量反馈（按钮临时变为「已复制 ✓」，不弹大提示条）
  const [copiedWechatIdx, setCopiedWechatIdx] = useState<number | null>(null);
  const handleCopyWechat = async (wechat: string, idx: number) => {
    const ok = await copyToClipboard(wechat);
    if (!ok) {
      toast.error("复制失败，请手动选择微信号复制");
      return;
    }
    setCopiedWechatIdx(idx);
    window.setTimeout(() => setCopiedWechatIdx((cur) => (cur === idx ? null : cur)), 2000);
  };

  // 平台管理员（超级管理员/管理员）不走用户端定制咨询流程：入口条、引导条与弹窗全部隐藏。
  // 统一收口到 role-utils 的 isAdminRole（覆盖全部大小写/下划线/连字符/ROLE_ 前缀变体）。
  const isPlatformAdmin = isAdminRole(userState.userInfo?.role);

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
        // 失败后强制回源刷新：避免页面套餐状态与数据库不一致（如后端已生效但本地未感知），
        // 防止用户对同一目标套餐重复点击后命中「当前已是该套餐」的矛盾提示
        await loadWorkspacePlan(planData.workspace.id);
        onUpgraded?.();
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
              开通套餐即享空间级席位 / 组件装配 / 存储 / 调用额度，不止于扩容，还可按需一次性加购
            </p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-blue-50/60 border border-blue-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-600 font-bold leading-relaxed">
            暂无可开通套餐的企业空间 / 团队空间，请先前往空间中枢创建或加入一个企业空间 / 团队空间。
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

  const isOwner = planData?.workspace?.ownerId === userState.userInfo?.id;
  const canAddSeat =
    isOwner &&
    !!currentPlan?.key &&
    currentPlan.key !== "STANDARD" &&
    !!planData?.workspace?.planExpiresAt &&
    !planData?.workspace?.isDefaultAdminWorkspace;

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
          {planData.workspace?.isDefaultAdminWorkspace && (
            <p className="text-[11px] text-amber-600 font-medium mt-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              当前为平台管理默认套餐视图（未绑定具体空间，仅供查看；增购席位等需真实空间的操作不可用）
            </p>
          )}
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

      {/* 全部空间套餐列表：当前套餐高亮、低阶禁用、高阶可升级（线下定制版单独渲染通栏卡片） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(planData.allPlans || [])
          .filter((plan: any) => plan.purchasable !== false)
          .map((plan: any) => {
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
                      <span className="text-[10px] text-slate-400 font-bold"> /月</span>
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mb-3">{plan.description}</p>

                {plan.trialGift?.enabled && plan.trialGift.points > 0 && (
                  <div className="mb-3 inline-flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg shrink-0">
                    <Gift className="w-3 h-3 text-amber-500" />
                    <span className="text-[11px] font-black text-amber-700">
                      新空间赠 {plan.trialGift.points} 算力点
                      {plan.trialGift.expireDays > 0
                        ? ` · ${plan.trialGift.expireDays}天`
                        : " · 永久"}
                    </span>
                  </div>
                )}

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

      {/* 线下定制版：通栏横幅卡片，右侧提供客户经理快捷联系方式（热线 / 邮箱）与咨询入口 */}
      {(() => {
        const customPlan = (planData.allPlans || []).find(
          (plan: any) => plan.purchasable === false
        );
        if (!customPlan) return null;
        const isCurrentCustom = customPlan.key === currentPlan?.key;
        return (
          <div
            id="custom-plan-banner"
            className="mt-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/80 via-orange-50/50 to-white p-5 scroll-mt-24"
          >
            {/* 布局自适应：1 位客户经理 → 左右分栏（右侧宽度随内容）；2 位 → 联系区横贯全宽双列，避免左侧大片留白 */}
            <div
              className={
                contactManagers.length > 1
                  ? "flex flex-col gap-4"
                  : "flex flex-col lg:flex-row lg:items-center gap-5"
              }
            >
              {/* 左：套餐信息与权益 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h3 className="text-sm font-black text-slate-800">{customPlan.name}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded font-bold">
                    按需定制
                  </span>
                  {isCurrentCustom && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#3182ce] text-white rounded font-bold">
                      当前套餐
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-medium mb-3">
                  {customPlan.description}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {(customPlan.features || []).map((f: string) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-semibold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {/* 右/下：客户经理快捷联系方式与咨询入口（后台可配置 1~2 位，布局随数量自适应） */}
              <div
                className={
                  contactManagers.length > 1
                    ? "w-full lg:border-t lg:border-amber-200 lg:pt-4 space-y-3"
                    : "shrink-0 lg:w-auto lg:border-l lg:border-amber-200 lg:pl-5 space-y-2"
                }
              >
                <div
                  className={
                    contactManagers.length > 1
                      ? "flex items-center justify-between gap-3 flex-wrap"
                      : ""
                  }
                >
                  <p className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                    <MessagesSquare className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    联系客户经理，1-2 个工作日内响应
                  </p>
                  {/* 2 位时：申请按钮提升到标题行右侧，节省纵向空间 */}
                  {contactManagers.length > 1 && !isPlatformAdmin && (
                    <button
                      onClick={() => setShowConsult(true)}
                      className="h-8 px-4 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <MessagesSquare className="w-3.5 h-3.5" />
                      申请定制方案
                    </button>
                  )}
                </div>
                <div
                  className={
                    contactManagers.length > 1
                      ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
                      : "space-y-2"
                  }
                >
                  {contactManagers.map((manager, idx) => {
                    const multi = contactManagers.length > 1;
                    return (
                    <div
                      key={`${manager.hotline}-${idx}`}
                      className={multi ? "p-3 bg-white/70 border border-amber-100 rounded-xl" : ""}
                    >
                      {manager.name && (
                        <p className="text-[11px] font-black text-slate-600 mb-1.5">{manager.name}</p>
                      )}
                      {/* 自适应布局：1 位 → 横向排布（电话/邮箱一列 + QQ/微信块并排铺开）；2 位 → 卡片内纵向堆叠 */}
                      <div className={multi ? "space-y-2" : "flex flex-wrap items-start gap-x-6 gap-y-3"}>
                        {/* 电话 / 邮箱 */}
                        <div className="space-y-2 min-w-0">
                          <a
                            href={`tel:${manager.hotline}`}
                            className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-[#2b6cb0] transition-colors group"
                          >
                            <span className="w-7 h-7 rounded-lg bg-white border border-amber-200 flex items-center justify-center shrink-0 group-hover:border-[#3182ce]/40">
                              <Phone className="w-3.5 h-3.5 text-amber-500" />
                            </span>
                            <span className="min-w-0 break-all">
                              {manager.hotline}
                              <span className="text-[10px] text-slate-400 font-bold ml-1">
                                （{manager.serviceHours}）
                              </span>
                            </span>
                          </a>
                          <div className="flex items-center gap-2">
                            <a
                              href={`mailto:${manager.email}?subject=${encodeURIComponent(CONTACT_MAIL_SUBJECT)}`}
                              className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-[#2b6cb0] transition-colors group min-w-0"
                            >
                              <span className="w-7 h-7 rounded-lg bg-white border border-amber-200 flex items-center justify-center shrink-0 group-hover:border-[#3182ce]/40">
                                <Mail className="w-3.5 h-3.5 text-amber-500" />
                              </span>
                              <span className="min-w-0 break-all">{manager.email}</span>
                            </a>
                            {/* 快捷调起本机邮箱客户端（预填主题），点击直接写邮件 */}
                            <button
                              type="button"
                              title="调起本机邮箱客户端写邮件（已预填主题）"
                              onClick={() => {
                                window.location.href = `mailto:${manager.email}?subject=${encodeURIComponent(CONTACT_MAIL_SUBJECT)}`;
                              }}
                              className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md border border-amber-300 bg-white text-[10px] font-bold text-amber-700 hover:bg-amber-50 hover:border-amber-400 transition-all cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              写邮件
                            </button>
                          </div>
                        </div>
                        {/* QQ：扫码添加为主（二维码可点击放大），QQ 号 / 加QQ 为次 */}
                        {(manager.qq || manager.qqQr) && (
                          <div className="flex items-start gap-2 min-w-0">
                            {manager.qqQr && (
                              <img
                                src={manager.qqQr}
                                alt="QQ 二维码（点击放大）"
                                title="点击放大查看"
                                onClick={() => setQrZoom({ src: manager.qqQr!, label: "QQ 二维码 · 请使用 QQ 扫一扫添加" })}
                                className="w-14 h-14 rounded-lg border border-amber-200 object-cover shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-slate-500 mb-0.5">
                                QQ · {manager.qqQr ? "扫码添加" : "搜索添加"}
                              </p>
                              {manager.qq && (
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 min-w-0">
                                    <MessageCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span className="min-w-0 break-all">{manager.qq}</span>
                                  </span>
                                  <button
                                    type="button"
                                    title="直接调起本机 QQ 客户端添加（未安装将提示）"
                                    onClick={() => handleAddQq(manager.qq!)}
                                    className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md border border-amber-300 bg-white text-[10px] font-bold text-amber-700 hover:bg-amber-50 hover:border-amber-400 transition-all cursor-pointer"
                                  >
                                    <UserPlus className="w-3 h-3" />
                                    加QQ
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {/* 微信：扫码添加为主（二维码可点击放大），微信号 / 复制为次 */}
                        {(manager.wechat || manager.wechatQr) && (
                          <div className="flex items-start gap-2 min-w-0">
                            {manager.wechatQr && (
                              <img
                                src={manager.wechatQr}
                                alt="微信二维码（点击放大）"
                                title="点击放大查看"
                                onClick={() => setQrZoom({ src: manager.wechatQr!, label: "微信二维码 · 请使用微信扫一扫添加" })}
                                className="w-14 h-14 rounded-lg border border-amber-200 object-cover shrink-0 cursor-zoom-in hover:opacity-80 transition-opacity"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="text-[10px] font-black text-slate-500 mb-0.5">
                                微信 · {manager.wechatQr ? "扫码添加" : "搜索添加"}
                              </p>
                              {manager.wechat && (
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 min-w-0">
                                    <MessagesSquare className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span className="min-w-0 break-all">{manager.wechat}</span>
                                  </span>
                                  <button
                                    type="button"
                                    title="复制微信号，打开微信 → 添加朋友 → 粘贴搜索"
                                    onClick={() => handleCopyWechat(manager.wechat!, idx)}
                                    className={`shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] font-bold transition-all cursor-pointer ${
                                      copiedWechatIdx === idx
                                        ? "border-emerald-400 bg-emerald-50 text-emerald-600"
                                        : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400"
                                    }`}
                                  >
                                    <Copy className="w-3 h-3" />
                                    {copiedWechatIdx === idx ? "已复制 ✓" : "复制微信号"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
                {/* 1 位时：申请按钮保持在联系区内 */}
                {contactManagers.length <= 1 &&
                  (!isPlatformAdmin ? (
                    <button
                      onClick={() => setShowConsult(true)}
                      className="w-full h-9 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <MessagesSquare className="w-3.5 h-3.5" />
                      申请定制方案
                    </button>
                  ) : (
                    <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                      定制方案由客户经理线下对接签约，不参与在线购买
                    </p>
                  ))}
                {/* 2 位时：平台管理员提示放联系区底部 */}
                {contactManagers.length > 1 && isPlatformAdmin && (
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                    定制方案由客户经理线下对接签约，不参与在线购买
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 二维码放大查看浮层（Portal 渲染，避免父级定位上下文导致错位） */}
      {qrZoom && (
        <QrLightbox src={qrZoom.src} title={qrZoom.label} onClose={() => setQrZoom(null)} />
      )}

      {/* 席位增购：空间所有者为企业 / 旗舰等付费套餐时，可按剩余天数折算增购团队席位 */}
      {canAddSeat && (
        <div className="mt-4 p-4 bg-blue-50/60 border border-blue-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#3182ce] shrink-0" />
            <p className="text-xs text-slate-700 font-bold leading-relaxed">
              需要更多团队协作席位？可按当前套餐剩余天数折算价格，一次性增购团队席位（有效期至套餐到期日）。
            </p>
          </div>
          <button
            onClick={() => setShowSeatAddon(true)}
            className="h-8 px-4 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap active:scale-[0.98]"
          >
            <Users className="w-3.5 h-3.5" />
            增购席位
          </button>
        </div>
      )}

      {/* 已开通最高档时的进一步扩容提示（在通用定制条之上给出更强引导）；平台管理员不展示 */}
      {!isPlatformAdmin && !planData.canUpgrade && (
        <div className="mt-4 p-4 bg-emerald-50/60 border border-emerald-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-800 font-bold leading-relaxed">
              当前空间已开通最高档扩容包。如需进一步扩容席位、存储与调用额度，可提交定制方案咨询，客户经理将主动与您联系。
            </p>
          </div>
          <button
            onClick={() => setShowConsult(true)}
            className="h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap active:scale-[0.98]"
          >
            <Users className="w-3.5 h-3.5" />
            申请定制方案
          </button>
        </div>
      )}

      {/* 定制版咨询入口：让用户知道存在「定制版」选项并可主动发起咨询；平台管理员不展示 */}
      {!isPlatformAdmin && (
      <div className="mt-4 p-4 bg-slate-50/80 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-800 flex items-center gap-1.5">
            <MessagesSquare className="w-3.5 h-3.5 text-[#3182ce]" />
            需要超出旗舰版的规模？支持定制版方案
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5 leading-relaxed">
            定制版按合同约定开放席位、组件装配、存储与调用额度（含私有化部署、独享算力等），不在本页直接售卖。提交咨询后，客户经理将在 1-2 个工作日内与您联系。
          </p>
        </div>
        <button
          onClick={() => setShowConsult(true)}
          className="h-8 px-4 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold shadow-xs hover:shadow transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap active:scale-[0.98]"
        >
          <MessagesSquare className="w-3.5 h-3.5" />
          申请定制方案
        </button>
      </div>
      )}

      {!isPlatformAdmin && (
        <UpgradeRequestModal
          open={showConsult}
          onClose={() => setShowConsult(false)}
          planName="CUSTOM"
          planDisplayName="定制版"
          isLoggedIn={userState.isLoggedIn}
          userInfo={userState.userInfo}
        />
      )}

      <SeatAddonModal
        open={showSeatAddon}
        onClose={() => setShowSeatAddon(false)}
        onSuccess={() => {
          if (planData?.workspace?.id) loadWorkspacePlan(planData.workspace.id);
        }}
        workspaceId={planData?.workspace?.id || ""}
        workspaceName={planData?.workspace?.name}
        planExpiresAt={planData?.workspace?.planExpiresAt}
        currentPlanKey={currentPlan?.key}
      />
    </section>
  );
}
